import { CACHE_STRATEGIES } from '#common/constants.js'

const cashRegisterSchema = {
    type: { type: String, default: 'comax', enum: ['comax'] },
    storeId: { type: String, required: true, unique: true },
    data: {
        StoreID: String,
        GeneratePrt: String,
        ChkAllBarKod: Boolean,
    }
}

export const meta = {
    cacheStrategy: CACHE_STRATEGIES.HASHSET
}

export default cashRegisterSchema
