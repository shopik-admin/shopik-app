import { CACHE_STRATEGIES } from '#common/constants.js'

const itemRefSchema = {
    C: String,
    Kod: String,
    PrintImage: Boolean,
    SwNotActive: Boolean,
    ExerciseCostUnit: Number,
    BasketNum: Number,
    _id: false
}

const storeRefSchema = {
    Kod: String,
    Amount: Number,
    ExerciseCostUnit: Number,
    _id: false
}

const customerGrpRefSchema = {
    Kod: String,
    _id: false
}

const comaxSaleSchema = {
    comaxId: { type: String, required: true, unique: true, filter: true },
    kod: Number,
    name: { type: String, filter: true },
    remarkForPrint: String,
    nature: Number,
    fromDate: Date,
    toDate: Date,
    rawFromDate: String,
    rawToDate: String,

    swActive: { type: Boolean, filter: true },
    swSunday: Boolean,
    activeFor_Hour_Sunday: String,
    activeUpTo_Hour_Sunday: String,

    swMonday: Boolean,
    activeFor_Hour_Monday: String,
    activeUpTo_Hour_Monday: String,

    swTuesday: Boolean,
    activeFor_Hour_Tuesday: String,
    activeUpTo_Hour_Tuesday: String,

    swWednesday: Boolean,
    activeFor_Hour_Wednesday: String,
    activeUpTo_Hour_Wednesday: String,

    swThursday: Boolean,
    activeFor_Hour_Thursday: String,
    activeUpTo_Hour_Thursday: String,

    swFriday: Boolean,
    activeFor_Hour_Friday: String,
    activeUpTo_Hour_Friday: String,

    swSaturday: Boolean,
    activeFor_Hour_Saturday: String,
    activeUpTo_Hour_Saturday: String,

    swKupa: Boolean,

    realizationPercent: Number,
    swAllBranches: Boolean,
    swAllCustomers: Boolean,
    swAllItems: Boolean,
    swPrintNm: Boolean,
    swSignageOnly: Boolean,
    swCasing: Boolean,
    swIncludeRelatedCompStores: Boolean,
    promotionType: { type: Number, filter: true },
    supplierName: String,

    quantity: Number,
    minQty: Number,
    maxQty: Number,
    total: Number,

    getGiftItem: Number,
    getRemark: String,
    getCmt: Number,
    swIncludeNetoItem: Boolean,
    getTotal: Number,
    getDiscountPercent: Number,
    getDiscountTotal: Number,

    totalForActivate: Number,
    swSameDiffItems: Number,
    withoutPrintContent: Boolean,
    rating: Number,
    noAdditionalDiscounts: Boolean,
    withoutPresentList: Boolean,
    withoutPrintingData: Boolean,
    classified: Number,
    maxInDoc: Number,
    swCalcEnd: Number,
    swCheck_ForTotalNeto: Boolean,
    swCalcDis: Number,
    swMustPay_ClubCredit: Boolean,
    spurMessage: String,
    spurTotal: Number,
    spurQty: Number,
    doubleDeals: Boolean,
    withoutMarkOnWeb: Number,
    swSupplierCharge: Boolean,
    supplierForCharge: Number,
    priceListForCharge: Number,
    swChargeType: Number,
    totalDiscountCharge: Number,
    swOperative: Boolean,
    swNoSplit: Boolean,
    mustAdditionalPromotions: String,
    textForWeb: String,
    textToPrint: String,
    textToPrint_Unicode: String,
    approvedSignage: Boolean,
    tag1: Number,
    tag2: Number,
    selfFinancingReward: Boolean,
    promoForRealization: Number,
    costOfRealizingGift: Number,
    selectPromo_ToMultiply: String,
    selectPromo_ToNotMultiply: String,

    stores: [storeRefSchema],
    customerGrp: [customerGrpRefSchema],
    items: [itemRefSchema],
    suppliers: [itemRefSchema],
    itemsGrp: [itemRefSchema],
    itemsSubGrp: [itemRefSchema],
    itemsDep: [itemRefSchema],
    itemsModel: [itemRefSchema],
    itemsVarious: [itemRefSchema],
    itemsAttribute1: [itemRefSchema],
    itemsAttribute2: [itemRefSchema],
    itemsAttribute3: [itemRefSchema],

    getItems: [itemRefSchema],
    getSuppliers: [itemRefSchema],
    getItemsGrp: [itemRefSchema],
    getItemsSubGrp: [itemRefSchema],
    getItemsDep: [itemRefSchema],
    getItemsModel: [itemRefSchema],
    getItemsAttribute1: [itemRefSchema],
    getItemsAttribute2: [itemRefSchema],
    getItemsAttribute3: [itemRefSchema],

    syncedAt: Date,
    lastImportedAt: Date
}

export const meta = {
    index: [{ lastImportedAt: -1 }],
    cacheStrategy: CACHE_STRATEGIES.VERSION
}

export default comaxSaleSchema
