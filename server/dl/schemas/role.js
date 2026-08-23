import { CACHE_STRATEGIES } from '#common/constants.js'
import allPermissions from '#server/utils/auth/permissions.js'
const allPermissionsHash = allPermissions.reduce((acc, curr) => {
    acc[curr] = true
    return acc
}, {})

const roleSchema = {
    name: {
        type: String,
        required: true,
        maxlength: 100,
        minlength: 3,
        trim: true,
        unique: true
    },
    parentId: { type: String, filter: true },
    parentIds: { type: [String], filter: true },
    permissions: {
        type: [String],
        validate: {
            validator: function (permissions) {
                return permissions.every(p => allPermissionsHash[p])
            },
            message: 'Invalid permissions.'
        }
    }
}

export const meta = { cacheStrategy: CACHE_STRATEGIES.HASHSET }

export default roleSchema