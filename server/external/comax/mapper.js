import { normalizeArray } from './parser.js'
import { parseComaxDate, parseComaxDateTime } from './utils.js'

// Departments that are VAT-exempt even though their name does not say so.
// Fresh produce is exempt by law; its Comax department is named
// "פירות וירקות טריים" (the taxed sibling, dept 9, is "עם מע\"מ").
const VAT_EXEMPT_DEPARTMENT_CODES = new Set(['13'])

// "ללא מע\"מ" with the quotes/spaces removed. Matching is done on the
// quote-stripped name so every spelling of the gershayim matches.
const VAT_EXEMPT_NAME = /\u05DC\u05DC\u05D0\s*\u05DE\u05E2\u05DE/

/**
 * Comax does not maintain a per-item VAT flag: `IsIncludeVat` belongs to the
 * price list (1069 is always true, 255/100/101 always false), including for
 * departments literally named "ללא מע\"מ". So the tax status is derived from
 * the category tree instead, at import time.
 */
export function isVatExempt(item) {
    if (VAT_EXEMPT_DEPARTMENT_CODES.has(String(item.DepartmentCode ?? '').trim())) return true
    return [item.Department, item.Group, item.Sub_Group].some(name =>
        typeof name === 'string' && VAT_EXEMPT_NAME.test(name.replace(/["'`\u05F3\u05F4]/g, ''))
    )
}

/**
 * The delivery/buying price row, when the response carries one.
 *   row present with a positive price → that price
 *   row present but 0/negative       → null (clears the stored value)
 *   row absent                       → undefined (leave the stored value alone)
 */
export function extractBuyingPrice(item, deliveryPriceListId = process.env.COMAX_DELIVERY_PRICELIST_ID) {
    const id = String(deliveryPriceListId ?? '').trim()
    if (!id) return undefined
    const rows = normalizeArray(item.SalesPrice?.ClsItemPrices)
    // PriceListID is parsed as a number by fast-xml-parser — compare as strings.
    const row = rows.find(r => String(r?.PriceListID ?? '').trim() === id)
    if (!row) return undefined
    const price = Number(row.Price)
    return price > 0 ? price : null
}

/**
 * Comax charges a "trailing item" (TrailingItem) next to certain products —
 * the refundable bottle deposit. The item's own Price excludes it, so the
 * deposit is a separate product (usually 555501 "פקדון בקבוק 0.30") sold
 * PikadonCmt times per unit. A TrailingItem of 0 means "no trailing item".
 */
export function trailingItemId(item) {
    const id = Number(item.TrailingItem)
    return Number.isFinite(id) && id > 0 ? String(id) : null
}

export function mapItem(item, { deliveryPriceListId } = {}) {
    const price = Number(item.Price) || undefined
    const trailingId = trailingItemId(item)
    return {
        comaxId: String(item.ID ?? ''),
        barcode: item.Barcode ?? null,
        name: item.Name ?? null,
        description: item.AtarDescription ?? null,
        remark: item.Remark ?? null,
        serial: item.SerialNo ?? null,

        price,
        supplierPrice: Number(item.SupplierPrice) || undefined,
        buyingPrice: extractBuyingPrice(item, deliveryPriceListId),

        // Deposit reference only. The import resolves it to the deposit product
        // and then adds trailingItemPrice / trailingPrice / priceWithTrailing;
        // products without a trailing item carry none of those fields.
        trailingItemId: trailingId,
        ...(trailingId ? { trailingItemQuantity: Number(item.PikadonCmt) || 1 } : {}),

        superDepartmentCode: item.SuperDepartmentCode ?? null,
        superDepartment: item.SuperDepartment ?? null,
        departmentCode: item.DepartmentCode ?? null,
        department: item.Department ?? null,
        groupCode: item.GroupCode ?? null,
        group: item.Group ?? null,
        subGroupCode: item.Sub_GroupCode ?? null,
        subGroup: item.Sub_Group ?? null,
        supplierId: item.SupplierID ?? null,
        supplier: item.SupplierName ?? null,
        manufacturerCode: item.ManufacturerCode ?? null,
        manufacturer: item.Manufacturer ?? null,

        height: Number(item.Height) || undefined,
        width: Number(item.Width) || undefined,
        length: Number(item.Length) || undefined,
        weight: Number(item.Weight) || undefined,

        Size: item.Size != null ? String(item.Size).trim() || null : null,
        SwWeighable: item.SwWeighable === true || item.SwWeighable === 1 || item.SwWeighable === 'true' || item.SwWeighable === '1',
        Content: item.Content != null && item.Content !== '' ? Number(item.Content) : undefined,
        ContentUnit: item.ContentUnit != null ? String(item.ContentUnit).trim() || null : null,
        ContentMeasure: item.ContentMeasure != null && item.ContentMeasure !== '' ? Number(item.ContentMeasure) : undefined,
        QtyType: item.QtyType != null ? String(item.QtyType).trim() || null : null,

        calories: Number(item.Energia) || undefined,
        carbohydrates: Number(item.Pahmemot) || undefined,
        protein: Number(item.Helbonim) || undefined,
        fat: Number(item.Shumanim) || undefined,
        cholesterol: Number(item.Colestrol) || undefined,
        alcohol: item.SwAlcohol == 1,

        picUrl: item.PicURL ?? null,

        colors: normalizeArray(item.Colors?.Color).map(c => ({ id: c.ID, name: c.Name })),
        sizes: normalizeArray(item.Sizes?.Size).map(s => ({ id: s.ID, name: s.Name })),
        models: normalizeArray(item.ItemModel)?.map(m => ({ id: m.ID, name: m.Name })) ?? [],
        prices: normalizeArray(item.SalesPrice?.ClsItemPrices).map(p => ({
            priceListId: p.PriceListID != null ? String(p.PriceListID) : null,
            price: Number(p.Price)
        })),

        openDate: parseComaxDate(item.OpenDate),
        archiveDate: parseComaxDate(item.ArchiveDate),
        blockSalesDate: parseComaxDate(item.BlockSalesDate),
        blockPurchaseDate: parseComaxDate(item.BlockPurchaseDate),

        vat: !isVatExempt(item),
        showInWeb: item.NotShowInWeb === false || item.NotShowInWeb === '0' || item.NotShowInWeb === 0 || item.NotShowInWeb === 'false',
        archived: !!item.ArchiveDate
    }
}

export function mapBalance(item) {
    return {
        comaxId: item.ID != null ? String(item.ID) : '',
        barcode: item.Barcode != null ? String(item.Barcode).trim() : null,
        name: item.Name ?? null,
        balance: Number(item.Balance) || 0,
        balanceAvailable: item.BalanceAvailabale != null && item.BalanceAvailabale !== '' ? Number(item.BalanceAvailabale) : null,
        error: item.ErrorMessage || null,
    }
}

/**
 * A row from `Get_AllItemsBalanceBySearch_Extended` (the sales-window feed).
 *
 * Only the fields the storeIds decision needs: the barcode, the department the
 * window is configured on, and when it last sold in this store. The date
 * arrives as `DD/MM/YYYY HH:mm:ss`; `LastSaleDate` is empty for an item that
 * never sold, which `parseComaxDateTime` turns into null.
 */
export function mapSalesWindowItem(item) {
    return {
        barcode: item.Barcode != null ? String(item.Barcode).trim() : null,
        departmentCode: item.DepartmentKod != null ? String(item.DepartmentKod) : null,
        superDepartmentCode: item.SuperDepartmentKod != null ? String(item.SuperDepartmentKod) : null,
        lastSaleDate: parseComaxDateTime(item.LastSaleDate),
        salesLastDays: Number(item.SalesLastDays) || 0,
        balance: Number(item.Balance) || 0
    }
}

export function isInStock(b) {
    return !b.error && b.balance > 0
}

export function mapPromotion(item) {
    return {
        comaxId: item.Kod != null ? String(item.Kod) : '',
        kod: item.Kod ?? null,
        name: item.Nm ?? null,
        remarkForPrint: item.RemarkForPrint ?? null,
        nature: item.Nature ?? null,
        fromDate: parseComaxDateTime(item.FromDate),
        toDate: parseComaxDateTime(item.ToDate),
        rawFromDate: item.FromDate ?? null,
        rawToDate: item.ToDate ?? null,

        swActive: item.SwActive ?? false,
        swSunday: item.SwSunday ?? false,
        activeFor_Hour_Sunday: item.ActiveFor_Hour_Sunday ?? null,
        activeUpTo_Hour_Sunday: item.ActiveUpTo_Hour_Sunday ?? null,

        swMonday: item.SwMonday ?? false,
        activeFor_Hour_Monday: item.ActiveFor_Hour_Monday ?? null,
        activeUpTo_Hour_Monday: item.ActiveUpTo_Hour_Monday ?? null,

        swTuesday: item.SwTuesday ?? false,
        activeFor_Hour_Tuesday: item.ActiveFor_Hour_Tuesday ?? null,
        activeUpTo_Hour_Tuesday: item.ActiveUpTo_Hour_Tuesday ?? null,

        swWednesday: item.SwWednesday ?? false,
        activeFor_Hour_Wednesday: item.ActiveFor_Hour_Wednesday ?? null,
        activeUpTo_Hour_Wednesday: item.ActiveUpTo_Hour_Wednesday ?? null,

        swThursday: item.SwThursday ?? false,
        activeFor_Hour_Thursday: item.ActiveFor_Hour_Thursday ?? null,
        activeUpTo_Hour_Thursday: item.ActiveUpTo_Hour_Thursday ?? null,

        swFriday: item.SwFriday ?? false,
        activeFor_Hour_Friday: item.ActiveFor_Hour_Friday ?? null,
        activeUpTo_Hour_Friday: item.ActiveUpTo_Hour_Friday ?? null,

        swSaturday: item.SwSaturday ?? false,
        activeFor_Hour_Saturday: item.ActiveFor_Hour_Saturday ?? null,
        activeUpTo_Hour_Saturday: item.ActiveUpTo_Hour_Saturday ?? null,

        swKupa: item.SwKupa ?? false,
        realizationPercent: Number(item.RealizationPercent) || 0,
        swAllBranches: item.SwAllBranches ?? false,
        swAllCustomers: item.SwAllCustomers ?? false,
        swAllItems: item.SwAllItems ?? false,
        swPrintNm: item.SwPrintNm ?? false,
        swSignageOnly: item.SwSignageOnly ?? false,
        swCasing: item.SwCasing ?? false,
        swIncludeRelatedCompStores: item.SwIncludeRelatedCompStores ?? false,
        promotionType: item.PromotionType ?? null,
        supplierName: item.SupplierName ?? null,
        quantity: Number(item.Quantity) || 0,
        minQty: Number(item.MinQty) || 0,
        maxQty: Number(item.MaxQty) || 0,
        total: Number(item.Total) || 0,
        getGiftItem: item.GetGiftItem ?? null,
        getRemark: item.GetRemark ?? null,
        getCmt: Number(item.GetCmt) || 0,
        swIncludeNetoItem: item.SwIncludeNetoItem ?? false,
        getTotal: Number(item.GetTotal) || 0,
        getDiscountPercent: Number(item.GetDiscountPrecent) || 0,
        getDiscountTotal: Number(item.GetDiscountTotal) || 0,
        totalForActivate: Number(item.TotalForActivate) || 0,
        swSameDiffItems: item.SwSameDiffItems ?? 0,
        withoutPrintContent: item.WithoutPrintContent ?? false,
        rating: Number(item.Rating) || 0,
        noAdditionalDiscounts: item.NoAdditionalDiscounts ?? false,
        withoutPresentList: item.WithoutPresentList ?? false,
        withoutPrintingData: item.WithoutPrintingData ?? false,
        classified: Number(item.Classified) || 0,
        maxInDoc: Number(item.MaxInDoc) || 0,
        swCalcEnd: Number(item.SwCalcEnd) || 0,
        swCheck_ForTotalNeto: item.SwCheck_ForTotalNeto ?? false,
        swCalcDis: Number(item.SwCalcDis) || 0,
        swMustPay_ClubCredit: item.SwMustPay_ClubCredit ?? false,
        spurMessage: item.SpurMessage ?? null,
        spurTotal: Number(item.SpurTotal) || 0,
        spurQty: Number(item.SpurQty) || 0,
        doubleDeals: item.DoubleDeals ?? false,
        withoutMarkOnWeb: Number(item.WithoutMarkOnWeb) || 0,
        swSupplierCharge: item.SwSupplierCharge ?? false,
        supplierForCharge: item.SupplierForCharge ?? null,
        priceListForCharge: item.PriceListForCharge ?? null,
        swChargeType: Number(item.SwChargeType) || 0,
        totalDiscountCharge: Number(item.TotalDiscountCharge) || 0,
        swOperative: item.SwOperative ?? false,
        swNoSplit: item.SwNoSplit ?? false,
        mustAdditionalPromotions: item.MustAdditionalPromotions ?? null,
        textForWeb: item.TextForWeb ?? null,
        textToPrint: item.TextToPrint ?? null,
        textToPrint_Unicode: item.TextToPrint_Unicode ?? null,
        approvedSignage: item.ApprovedSignage ?? false,
        tag1: Number(item.Tag1) || 0,
        tag2: Number(item.Tag2) || 0,
        selfFinancingReward: item.SelfFinancingReward ?? false,
        promoForRealization: Number(item.PromoForRealization) || 0,
        costOfRealizingGift: Number(item.CostOfRealizingGift) || 0,
        selectPromo_ToMultiply: item.SelectPromo_ToMultiply ?? null,
        selectPromo_ToNotMultiply: item.SelectPromo_ToNotMultiply ?? null,

        stores: Array.isArray(item.Stores) ? item.Stores.map(s => ({
            Kod: s.Kod != null ? String(s.Kod) : null,
            Amount: Number(s.Amount) || 0,
            ExerciseCostUnit: Number(s.ExerciseCostUnit) || 0
        })) : [],

        customerGrp: Array.isArray(item.CustomerGrp) ? item.CustomerGrp.map(c => ({
            Kod: c.Kod != null ? String(c.Kod) : null
        })) : [],

        items: Array.isArray(item.Items) ? item.Items.map(mapItemRef) : [],
        suppliers: Array.isArray(item.Suppliers) ? item.Suppliers.map(mapItemRef) : [],
        itemsGrp: Array.isArray(item.ItemsGrp) ? item.ItemsGrp.map(mapItemRef) : [],
        itemsSubGrp: Array.isArray(item.ItemsSubGrp) ? item.ItemsSubGrp.map(mapItemRef) : [],
        itemsDep: Array.isArray(item.ItemsDep) ? item.ItemsDep.map(mapItemRef) : [],
        itemsModel: Array.isArray(item.ItemsModel) ? item.ItemsModel.map(mapItemRef) : [],
        itemsVarious: Array.isArray(item.ItemsVarious) ? item.ItemsVarious.map(mapItemRef) : [],
        itemsAttribute1: Array.isArray(item.ItemsAttribute1) ? item.ItemsAttribute1.map(mapItemRef) : [],
        itemsAttribute2: Array.isArray(item.ItemsAttribute2) ? item.ItemsAttribute2.map(mapItemRef) : [],
        itemsAttribute3: Array.isArray(item.ItemsAttribute3) ? item.ItemsAttribute3.map(mapItemRef) : [],

        getItems: Array.isArray(item.GetItems) ? item.GetItems.map(mapItemRef) : [],
        getSuppliers: Array.isArray(item.GetSuppliers) ? item.GetSuppliers.map(mapItemRef) : [],
        getItemsGrp: Array.isArray(item.GetItemsGrp) ? item.GetItemsGrp.map(mapItemRef) : [],
        getItemsSubGrp: Array.isArray(item.GetItemsSubGrp) ? item.GetItemsSubGrp.map(mapItemRef) : [],
        getItemsDep: Array.isArray(item.GetItemsDep) ? item.GetItemsDep.map(mapItemRef) : [],
        getItemsModel: Array.isArray(item.GetItemsModel) ? item.GetItemsModel.map(mapItemRef) : [],
        getItemsAttribute1: Array.isArray(item.GetItemsAttribute1) ? item.GetItemsAttribute1.map(mapItemRef) : [],
        getItemsAttribute2: Array.isArray(item.GetItemsAttribute2) ? item.GetItemsAttribute2.map(mapItemRef) : [],
        getItemsAttribute3: Array.isArray(item.GetItemsAttribute3) ? item.GetItemsAttribute3.map(mapItemRef) : []
    }
}

function mapItemRef(ref) {
    if (!ref) return null
    return {
        C: ref.C != null ? String(ref.C) : null,
        Kod: ref.Kod != null ? String(ref.Kod) : null,
        PrintImage: ref.PrintImage ?? false,
        SwNotActive: ref.SwNotActive ?? false,
        ExerciseCostUnit: Number(ref.ExerciseCostUnit) || 0,
        BasketNum: Number(ref.BasketNum) || 0
    }
}


