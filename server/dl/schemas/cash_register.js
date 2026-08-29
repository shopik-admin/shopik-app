const cashRegisterSchema = {
    type: { type: String }, // comax
    storeId: { type: String, required: true },
    data: {
        // Comax Data: not required because the cash register could be of other type potentially.
        // PriceListID: String, 
        // CustomerID: String,
        // LoginID: String,
        // LoginPassword: String,
        // StoreID: String,
        // GeneratePrt: String,
        // ChkAllBarKod: Boolean,
    }
}

export default cashRegisterSchema