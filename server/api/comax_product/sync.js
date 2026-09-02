import buildCategories from './build_categories.js'
import enqueueChangedImages from '#server/services/image/enqueue.js'
import log from '#server/utils/log.js'

function isWeightProduct(comax) {
    if (comax.SwWeighable) return true
    // const size = String(comax.Size ?? '').trim().toLowerCase()
    // if (!size) return false
    // const norm = size.replace(/["'`׳״]/g, '').replace(/\s+/g, '')
    // // ק"ג variants: קג, קילו, kg
    // if (norm.includes('קג') || norm.includes('קילו') || norm.includes('kg')) return true
    return false
}

function buildUnit(comax, DL) {
    const isWeight = isWeightProduct(comax)
    if (isWeight) {
        return {
            type: DL.Product.constants.UNIT.WEIGHT,
            baseUnit: DL.Product.constants.BASE_UNIT.KG,
            minAmount: 0.5,
            step: 0.5,
            options: []
        }
    }
    return {
        type: DL.Product.constants.UNIT.ITEM,
        baseUnit: DL.Product.constants.BASE_UNIT.UNIT,
        minAmount: 1,
        step: 1,
        options: []
    }
}

function buildProduct(comax, DL) {
    const category = {}
    if (comax.subGroup) {
        category.id = comax.subGroupCode
        category.title = comax.subGroup
        category.pathIds = [comax.superDepartmentCode, comax.departmentCode, comax.groupCode, comax.subGroupCode]
    } else if (comax.group) {
        category.id = comax.groupCode
        category.title = comax.group
        category.pathIds = [comax.superDepartmentCode, comax.departmentCode, comax.groupCode]
    }
    const status = comax.archived ?
        DL.Product.constants.STATUS.ARCHIVED :
        comax.showInWeb ?
            DL.Product.constants.STATUS.ACTIVE :
            DL.Product.constants.STATUS.HIDDEN

    return {
        barcode: comax.barcode,
        name: comax.webName || comax.name,
        description: comax.description,
        producer: comax.manufacturer,
        category,
        prices: comax.price != null ? [{ domainId: 'default', price: comax.price }] : [],
        status,
        nutrients: {
            alcohol: comax.alcohol
        },
        unit: buildUnit(comax, DL)
    }
}

export default async function syncComax(payload, { DL }) {
    const filter = {}
    await buildCategories(payload, { DL })
    const comaxProducts = await DL.ComaxProduct.read(
        {
            superDepartmentCode: { $exists: true, $nin: ['12', null] },
            departmentCode: { $exists: true },
            groupCode: { $exists: true },
            ...filter
        },
        {
            _id: 0,
            comaxId: 1,
            barcode: 1,
            name: 1,
            webName: 1,
            description: 1,
            manufacturer: 1,
            superDepartmentCode: 1,
            superDepartment: 1,
            departmentCode: 1,
            department: 1,
            groupCode: 1,
            group: 1,
            subGroupCode: 1,
            subGroup: 1,
            price: 1,
            showInWeb: 1,
            archived: 1,
            Size: 1,
            SwWeighable: 1,
            ContentUnit: 1,
            Content: 1,
            ContentMeasure: 1
        },
        { limit: 0 }
    )


    if (comaxProducts.length === 0) {
        console.log('[Comax Sync] No products to sync')
        return { synced: 0, updated: 0, created: 0 }
    }

    const productsToSync = comaxProducts.map(c => buildProduct(c, DL))

    const result = await DL.Product.bulkWrite({
        docs: productsToSync,
        getFilter: p => ({ barcode: p.barcode }),
        getUpsert: p => p.status === DL.Product.constants.STATUS.ACTIVE
    })

    const syncedIds = comaxProducts.map(p => p.comaxId)
    await DL.ComaxProduct.update(
        { comaxId: { $in: syncedIds } },
        { syncedAt: new Date() }
    )

    console.log(`[Comax Sync] Created ${result.upsertedCount}, updated ${result.modifiedCount}`)

    try {
        const enqueued = await enqueueChangedImages(DL)
        log.info(`[Comax Sync] Image queue: ${enqueued.enqueued} jobs`)
    } catch (e) {
        log.warn('[Comax Sync] Image enqueue skipped:', e?.message || e)
    }

    return {
        synced: comaxProducts.length,
        created: result.upsertedCount,
        updated: result.modifiedCount
    }
}

syncComax.config = {
    required: [],
    permissions: ['product:update'],
    auth: 'required',
    preventMultiple: true
}