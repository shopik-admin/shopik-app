import executeInBatches from '#common/functions/executeInBatches.js'
import getWindowTS from '#common/functions/getWindowTS.js'

const SYNC_DAYS_AHEAD = 30

async function getActiveStoreIds(DL) {
    return DL.Store.Model.distinct('id', { active: true })
}

function formatDate(d) {
    return d.toISOString().split('T')[0]
}

/**
 * Bulk fetches all applicable templates for a list of stores in 2 database queries.
 */
async function fetchTemplatesForStores(storeIds, DL) {
    const templates = await DL.OrderWindowTemplate.read({
        active: true,
        $or: [
            { storeId: { $in: storeIds } },
            { master: true }
        ]
    })

    let masterTemplate
    const templateMap = new Map()
    for (const t of templates) {
        if (t.master)
            masterTemplate = t
        else
            templateMap.set(t.storeId, t)
    }
    if (!masterTemplate)
        throw new Error('No master template found')
    // Fall back to master template if a specific store template isn't found
    const finalMap = new Map()
    for (const id of storeIds) {
        const t = templateMap.get(id) || masterTemplate
        if (t && t.windows?.length) {
            finalMap.set(id, t)
        }
    }

    return finalMap
}

export default async function sync(payload, { DL }) {
    const storeIds = payload.storeIds || await getActiveStoreIds(DL)
    if (!storeIds.length) return []

    // 1. Fetch all store templates at once
    const templateMap = await fetchTemplatesForStores(storeIds, DL)
    const validStoreIds = Array.from(templateMap.keys())

    if (!validStoreIds.length) {
        return storeIds.map(id => ({ storeId: id, synced: 0 }))
    }

    // Calculate date bounds
    const timezone = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone
    const today = getWindowTS({ date: formatDate(new Date()), hour: 12, timezone })

    const endDate = new Date(today)
    endDate.setDate(endDate.getDate() + SYNC_DAYS_AHEAD)

    const startDateStr = formatDate(today)
    const endDateStr = formatDate(endDate)

    // 2. Bulk fetch all existing order windows for all stores within the date range
    const existingWindows = await DL.OrderWindow.read({
        storeId: { $in: validStoreIds },
        date: { $gte: startDateStr, $lte: endDateStr }
    }, { _id: 0 }, { limit: 0 })

    // Index existing windows by composite key: `storeId_date_start`
    const existingMap = new Map()
    for (const ew of existingWindows) {
        existingMap.set(`${ew.storeId}_${ew.date}_${ew.start}`, ew)
    }

    // Generate list of dates in range
    const datesInfo = []
    for (let d = new Date(today); d <= endDate; d.setDate(d.getDate() + 1)) {
        const current = new Date(d)
        datesInfo.push({
            date: formatDate(current),
            dayOfWeek: current.getDay()
        })
    }

    const bulkOperations = []
    const storeStats = Map.groupBy ?
        new Map(validStoreIds.map(id => [id, { created: 0, updated: 0, deleted: 0 }])) :
        new Map()

    if (!Map.groupBy) {
        validStoreIds.forEach(id => storeStats.set(id, { created: 0, updated: 0, deleted: 0 }))
    }

    // 3. Evaluate updates, creates, and soft-deletes in memory
    for (const storeId of validStoreIds) {
        const template = templateMap.get(storeId)
        const stats = storeStats.get(storeId)
        const { timezone } = template

        for (const { date, dayOfWeek } of datesInfo) {
            const templateWindows = template.windows.filter(w => w.dayOfWeek === dayOfWeek)
            if (!templateWindows.length) continue

            const templateStarts = new Set(templateWindows.map(w => w.start))

            // Check template windows against existing windows
            for (const tw of templateWindows) {
                const key = `${storeId}_${date}_${tw.start}`
                const existing = existingMap.get(key)
                const leadHours = tw.leadHours ?? template.leadHours

                if (existing) {
                    const needsUpdate = (
                        existing.end !== tw.end ||
                        existing.maxCapacity !== tw.maxCapacity ||
                        existing.leadHours !== leadHours ||
                        existing.timezone !== template.timezone
                    )

                    if (needsUpdate) {
                        bulkOperations.push({
                            updateOne: {
                                filter: { id: existing.id },
                                update: {
                                    $set: {
                                        end: tw.end,
                                        leadHours,
                                        endTimestamp: getWindowTS({ date, hour: tw.end, timezone }),
                                        leadTimestamp: getWindowTS({ date, hour: tw.start - leadHours, timezone }),
                                        maxCapacity: tw.maxCapacity,
                                        timezone: template.timezone
                                    }
                                }
                            }
                        })
                        stats.updated++
                    }
                } else {
                    bulkOperations.push({
                        insertOne: {
                            document: {
                                storeId,
                                date,
                                dayOfWeek,
                                start: tw.start,
                                end: tw.end,
                                maxCapacity: tw.maxCapacity,
                                totalOrders: 0,
                                leadHours: leadHours,
                                timezone: template.timezone,
                                startTimestamp: getWindowTS({ date, hour: tw.start }),
                                endTimestamp: getWindowTS({ date, hour: tw.end }),
                                leadTimestamp: getWindowTS({ date, hour: tw.start - leadHours })
                            }
                        }
                    })
                    stats.created++
                }
            }

            // Deactivate windows missing from template with 0 orders
            for (const [key, existing] of existingMap.entries()) {
                if (existing.storeId === storeId && existing.date === date) {
                    if (!templateStarts.has(existing.start) && existing.totalOrders === 0) {
                        bulkOperations.push({
                            updateOne: {
                                filter: { id: existing.id },
                                update: { $set: { active: false } }
                            }
                        })
                        stats.deleted++
                    }
                }
            }
        }
    }

    // 4. Execute all writes in batched MongoDB bulkWrite calls
    if (bulkOperations.length > 0) {
        const BATCH_SIZE = 2500
        await executeInBatches(
            bulkOperations,
            batch => DL.OrderWindow.Model.bulkWrite(batch, { ordered: false }),
            BATCH_SIZE
        )
    }

    // Format response
    return storeIds.map(storeId => {
        const stats = storeStats.get(storeId)
        return { storeId, synced: stats ?? {} }
    })
}

sync.config = {
    permissions: 'order_window:sync'
}