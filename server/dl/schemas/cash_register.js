const cashRegisterSchema = {
    enabled: { type: Boolean, default: true },
    type: { type: String }, // comax, nibit, etc.
    data: {
        PriceListID: String,
        CustomerID: String,
        LoginID: String,
        LoginPassword: String,
        StoreID: String,
        GeneratePrt: String,
        ChkAllBarKod: Boolean,
    }
}

export default cashRegisterSchema