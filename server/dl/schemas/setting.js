import { CACHE_STRATEGIES } from '#common/constants.js'

const constants = {
    formType: {
        TEXT: 'text',
        CHECKBOX: 'checkbox',
        SWITCH: 'switch',
        COLOR: 'color',
        SELECT: 'select',
        FILE: 'file',
        IMAGE: 'image',
        TEXTAREA: 'textarea',
        DATE: 'date',
        INFO: 'info',
        LINK: 'link',
        CSS: 'css'
    },
    renderType: {
        STRING: 'string',
        TR: 'tr',
        IMAGE: 'image',
        COLOR: 'color',
        LIST: 'list',
        FIELD: 'field',
        NAME: 'name',
        ID: 'id',
        ADDRESS: 'address',
        DATE: 'date',
        TIME: 'time',
        DATETIME: 'datetime',
        BOOLEAN: 'boolean',
        V_BOOLEAN: 'v-boolean',
        COLOR_BOOLEAN: 'color-boolean',
        NIS: 'nis',
        COIN: 'coin',
        MR: 'mr'
    }
}

const settingSchema = {
    key: {
        type: String,
        required: true
    },
    value: {
        type: String,
        required: true,
    },
    domainId: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true,
    },
    subCategory: {
        type: String,
        required: true,
    },
    formType: {
        type: String,
        enum: Object.values(constants.formType)
    },
    renderType: {
        type: String,
        enum: Object.values(constants.renderType)
    }
}
const index = [
    [{ domainId: 1, key: 1 }, { unique: true }]
]

export const meta = { index, cacheStrategy: CACHE_STRATEGIES.HASHSET }

export default settingSchema