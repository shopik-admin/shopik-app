import { CACHE_STRATEGIES } from '#common/constants.js'

const comaxProductSchema = {
    comaxId: String,
    barcode: { type: String, required: true, unique: true, filter: true },

    name: { type: String, filter: true },
    englishName: String,
    webName: String,
    description: String,
    remark: String,
    alternateId: String,
    serial: String,

    quantity: Number,
    price: Number,
    supplierPrice: Number,
    buyingPrice: Number,
    // Comax does not maintain a per-item VAT flag; the import derives it from
    // the category tree (departments named ללא מע"מ, plus fresh produce 13).
    vat: Boolean,
    // Shopik store ids (cash_register.storeId) this item is in stock in.
    // Written by the per-store HasInventory feed and the fresh-department feed.
    storeIds: { type: [String], filter: true },

    superDepartmentCode: String,
    departmentCode: String,
    groupCode: String,
    subGroupCode: String,
    superDepartment: { type: String, filter: true },
    department: { type: String, filter: true },
    group: { type: String, filter: true },
    subGroup: { type: String, filter: true },
    supplierId: String,
    supplierName: String,
    manufacturerCode: String,
    manufacturer: String,

    height: Number,
    width: Number,
    length: Number,
    weight: Number,

    // raw Comax weight/size indicators → used to derive product.unit
    Size: String,
    SwWeighable: Boolean,
    Content: Number,
    ContentUnit: String,
    ContentMeasure: Number,
    QtyType: String,
    calories: Number,
    carbohydrates: Number,
    protein: Number,
    fat: Number,
    cholesterol: Number,
    alcohol: Boolean,

    picUrl: String,

    colors: [{ id: String, name: String, _id: false }],
    sizes: [{ id: String, name: String, _id: false }],
    models: [{ id: String, name: String, _id: false }],
    prices: [{ priceListId: String, price: Number, _id: false }],

    openDate: Date,
    archiveDate: Date,
    blockSalesDate: Date,
    blockPurchaseDate: Date,

    showInWeb: { type: Boolean, filter: true },
    archived: { type: Boolean, filter: true },

    fetchConfig: {
        storeId: String,
        priceListId: String,
        withOutArchive: Boolean
    },

    syncedAt: Date,
    lastImportedAt: Date,
    buyingPriceImportedAt: Date,
    // Latest sale of this barcode in any store, from the sales-window feed.
    // Informational: the per-store decision is storeIds (see salesWindow.js).
    lastSaleDate: Date
}

export default comaxProductSchema
