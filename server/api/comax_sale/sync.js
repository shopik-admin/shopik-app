import { updateSalesAndProducts } from '../sale/sync.js'
const IGNORE_PROMO_TYPES = [18, 19, 5, 6, 9, 10]

function deduplicateKey(cs) {
    const items = (cs.items || []).map(i => String(i.Kod || i)).sort()
    const getItems = (cs.getItems || []).map(i => String(i.Kod || i)).sort()
    return JSON.stringify({
        items,
        getItems,
        getGiftItem: cs.getGiftItem ? String(cs.getGiftItem) : null,
        quantity: cs.quantity,
        minQty: cs.minQty,
        total: cs.total,
        getTotal: cs.getTotal,
        promotionType: cs.promotionType,
        getCmt: cs.getCmt,
        getDiscountPercent: cs.getDiscountPercent,
        getDiscountTotal: cs.getDiscountTotal,
        swAllItems: cs.swAllItems,
        maxQty: cs.maxQty
    })
}

function deduplicateSales(comaxSales) {
    const byKey = new Map()
    const deduplicateSaleIds = new Set()
    for (const cs of comaxSales) {
        const key = deduplicateKey(cs)
        const existing = byKey.get(key)
        if (!existing) {
            byKey.set(key, cs)
            continue
        }
        const existingDate = new Date(existing.fromDate).getTime()
        const candidateDate = new Date(cs.fromDate).getTime()
        const newerSale = candidateDate > existingDate ||
            (candidateDate === existingDate && String(cs.comaxId) > String(existing.comaxId))
        if (newerSale) {
            deduplicateSaleIds.add(existing.comaxId)
            byKey.set(key, cs)
        }
    }
    return { uniqueComaxSales: Array.from(byKey.values()), deduplicateSaleIds }
}

function buildSale(cs, kodToBarcodeMap, activeBarcodesSet, DL) {
    if (IGNORE_PROMO_TYPES.includes(cs.promotionType)) {
        return null
    }
    const { KINDS, TYPES, STATUS } = DL.Sale.constants
    const rawBarcodes = (cs.items || [])
        .filter(i => !i.SwNotActive)
        .map(i => kodToBarcodeMap.get(String(i.Kod)) || String(i.Kod))

    const rawReceiveBarcodes = (cs.getItems || [])
        .filter(i => !i.SwNotActive)
        .map(i => kodToBarcodeMap.get(String(i.Kod)) || String(i.Kod))

    if (cs.getGiftItem) {
        const giftBarcode = kodToBarcodeMap.get(String(cs.getGiftItem)) || String(cs.getGiftItem)
        if (!rawReceiveBarcodes.includes(giftBarcode)) {
            rawReceiveBarcodes.push(giftBarcode)
        }
    }

    let kind = KINDS.PRICE
    let type = cs.swAllItems ? TYPES.CART : TYPES.PRODUCT
    let amount = cs.quantity || cs.minQty || 1
    let price = cs.total || cs.getTotal || undefined
    let percent = cs.getDiscountPercent || undefined

    let receiveOverride = null

    // Specific PromotionType logic:
    // 1 – כמות בסכום
    // 5 – קנה בסכום הוסף קבל
    // 6 – קנה בכמות הוסף קבל
    // 9 – שני בחצי מחיר
    // 10 – קנה בכמות קבל(אותו הפריט)
    // 18 – הנחת סוף חשבון (ignored)
    switch (cs.promotionType) {
        case 1:
            kind = percent > 0 ? KINDS.PERCENT : KINDS.PRICE
            amount = cs.quantity || cs.minQty || 1
            price = cs.total
            break
        case 5:
            if (rawReceiveBarcodes.length > 0) {
                kind = KINDS.RECEIVE_PRICE
                price = cs.total
            } else {
                return null
            }
            break
        case 6:
            amount = cs.quantity || cs.minQty || 1
            if (rawReceiveBarcodes.length > 0) {
                kind = KINDS.RECEIVE_AMOUNT
            } else {
                return null
            }
            break
        case 9:
            amount = cs.quantity || 1
            kind = KINDS.RECEIVE_AMOUNT
            if (rawReceiveBarcodes.length === 0) {
                rawReceiveBarcodes.push(...validBarcodes)
            }
            receiveOverride = {
                variety: false,
                barcodes: rawReceiveBarcodes.length > 0 ? rawReceiveBarcodes : validBarcodes,
                amount: cs.getCmt || 1,
                type: KINDS.PERCENT,
                percent: cs.getDiscountPercent || 50
            }
            break
        case 10:
            amount = cs.quantity || cs.minQty || 1
            kind = KINDS.RECEIVE_AMOUNT
            if (rawReceiveBarcodes.length === 0) {
                rawReceiveBarcodes.push(...validBarcodes)
            }
            break
        default:
            return null
    }

    const now = Date.now()
    const start = new Date(cs.fromDate || Date.now())
    const end = new Date(cs.toDate || now + 7 * 24 * 60 * 60 * 1000)
    end.setHours(23, 59)
    if (start.getTime() > end.getTime())
        return null

    let status = STATUS.ACTIVE
    if (!cs.swActive) {
        status = STATUS.CANCELED
    } else if (end.getTime() < now) {
        status = STATUS.DONE
    } else if (start.getTime() > now) {
        status = STATUS.PENDING
    }

    const saleName = cs.name || `מבצע ${cs.comaxId}`
    const displayName = cs.name || `מבצע ${cs.comaxId}`

    const validBarcodes = rawBarcodes?.filter(b => activeBarcodesSet.has(b))

    if (validBarcodes.length === 0) {
        return null
    }

    const saleDoc = {
        id: cs.comaxId,
        name: saleName,
        displayName: displayName,
        type,
        kind,
        status,
        start,
        end,
        amount,
        limit: cs.maxQty || 0,
        price,
        percent,
        barcodes: validBarcodes,
        description: cs.remarkForPrint || undefined,
        createdBy: 'Comax Sync'
    }

    if (receiveOverride) {
        saleDoc.receive = receiveOverride
    } else if (rawReceiveBarcodes.length > 0) {
        saleDoc.receive = {
            variety: false,
            barcodes: rawReceiveBarcodes,
            amount: cs.getCmt || 1,
            type: cs.getDiscountPercent > 0 ? KINDS.PERCENT : KINDS.PRICE,
            percent: cs.getDiscountPercent || (kind === KINDS.RECEIVE_AMOUNT ? 100 : undefined),
            price: cs.getDiscountTotal || undefined
        }
    }

    // Check receive.barcodes for receive-amount and receive-price sales
    if (saleDoc.kind === KINDS.RECEIVE_AMOUNT || saleDoc.kind === KINDS.RECEIVE_PRICE) {
        const receiveBarcodesList = saleDoc.receive?.barcodes || []
        const validReceiveBarcodes = receiveBarcodesList.filter(b => activeBarcodesSet.has(b))

        if (validReceiveBarcodes.length === 0) {
            return null
        }
        saleDoc.receive.barcodes = validReceiveBarcodes
    }

    return saleDoc
}

export default async function syncComaxSales(payload, { DL }) {
    const comaxSales = await DL.ComaxSale.read(
        { swActive: true, promotionType: { $nin: IGNORE_PROMO_TYPES } },
        {
            _id: 0,
            name: 1,
            comaxId: 1,
            promotionType: 1,
            items: 1,
            quantity: 1,
            total: 1,
            fromDate: 1,
            toDate: 1,
            minQty: 1,
            maxQty: 1,
            remarkForPrint: 1,
            getDiscountTotal: 1,
            getDiscountPercent: 1,
            getGiftItem: 1,
            getItems: 1,
            getTotal: 1,
            getCmt: 1,
            swActive: 1,
            swAllItems: 1
        },
        { limit: 0 }
    )

    if (comaxSales.length === 0) {
        console.log('[Comax Sales Sync] No sales to sync')
        await updateSalesAndProducts({ DL })
        return { synced: 0, updated: 0, created: 0 }
    }

    const { uniqueComaxSales, deduplicateSaleIds } = deduplicateSales(comaxSales)
    if (uniqueComaxSales.length !== comaxSales.length) {
        console.log(`[Comax Sales Sync] Deduplicated ${deduplicateSaleIds.size} duplicate sales`)
    }

    // Get active product barcodes
    const activeProductsBarcodes = await DL.Product.Model.distinct('barcode', {
        status: DL.Product.constants.STATUS.ACTIVE
    })
    const activeBarcodesSet = new Set(activeProductsBarcodes)

    // Collect all item Kods for barcode resolution
    const kodsSet = new Set()
    for (const cs of uniqueComaxSales) {
        if (cs.getGiftItem) kodsSet.add(String(cs.getGiftItem))
        for (const item of (cs.items || [])) {
            if (item.Kod) kodsSet.add(String(item.Kod))
        }
        for (const item of (cs.getItems || [])) {
            if (item.Kod) kodsSet.add(String(item.Kod))
        }
    }

    const kodArray = Array.from(kodsSet)
    let kodToBarcodeMap = new Map()

    if (kodArray.length > 0) {
        const matchingProducts = await DL.ComaxProduct.read(
            {
                $or: [
                    { comaxId: { $in: kodArray } },
                    { barcode: { $in: kodArray } }
                ]
            },
            { barcode: 1, comaxId: 1 },
            { limit: 0 }
        )

        for (const p of matchingProducts) {
            if (p.comaxId) kodToBarcodeMap.set(String(p.comaxId), p.barcode)
            if (p.barcode) kodToBarcodeMap.set(String(p.barcode), p.barcode)
        }
    }

    const salesToSync = uniqueComaxSales
        .map(cs => buildSale(cs, kodToBarcodeMap, activeBarcodesSet, DL))
        .filter(Boolean)

    if (salesToSync.length === 0) {
        console.log('[Comax Sales Sync] No valid sales matching active products to sync')
        await updateSalesAndProducts({ DL })
        return { synced: 0, updated: 0, created: 0 }
    }

    const result = await DL.Sale.bulkWrite({
        docs: salesToSync
    })

    const syncedIds = uniqueComaxSales.map(s => s.comaxId)
    await DL.ComaxSale.update(
        { comaxId: { $in: syncedIds } },
        { syncedAt: new Date() }
    )

    const saleResults = await updateSalesAndProducts({ DL })

    console.log(`[Comax Sales Sync]\nCreated ${result.upsertedCount}\nupdated ${result.modifiedCount}\nStatus updates: ${JSON.stringify(saleResults, null, 2)}`)

    return {
        synced: salesToSync.length,
        created: result.upsertedCount,
        updated: result.modifiedCount,
        saleUpdates: saleResults
    }
}

syncComaxSales.config = {
    required: [],
    permissions: ['sale:update'],
    auth: 'required',
    preventMultiple: true
}
