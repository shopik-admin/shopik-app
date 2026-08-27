import { CACHE_STRATEGIES } from '#common/constants.js'
import uid from '#common/functions/uid.js'
import get from '#common/functions/get.js'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'
import path from 'path'
import fs from 'fs'

import log from '#server/utils/log.js'

const { Schema } = mongoose

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SCHEMAS_DIR = path.resolve(__dirname, '.', 'schemas')

function toPascalCase(str) {
    return str.replace(/(?:^|-|_)(\w)/g, (_, c) => c.toUpperCase())
}

function toSnakeCase(str) {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
}

function toSnakeCasePlural(str) {
    const parts = str.split('_')
    return parts.map((part, index) => index === parts.length - 1 ? singularToPlural(part) : part).join('_')
}

function singularToPlural(word) {
    // Words ending in consonant + y → ies
    if (/[^aeiou]y$/.test(word))
        return word.slice(0, -1) + 'ies'

    // Words ending in s, sh, ch, x, z → es
    if (/[sxz]$|sh$|ch$/.test(word))
        return word + 'es'

    // Default: add "s"
    return word + 's'
}

/**
 * Dynamically import a schema file and return { default: schema, meta }
 */
async function loadSchemaFile(filePath) {
    let url
    if (process.platform === 'win32') {
        // On Windows: c:\path → file:///c:/path
        const winPath = filePath.replace(/\\/g, '/')
        url = `file://${winPath}`
    } else {
        // On Unix/macOS: /path/to/file or ./relative/path
        if (filePath.startsWith('./') || filePath.startsWith('../')) {
            url = path.resolve(filePath)
        } else {
            url = `file://${filePath}`
        }
    }
    const mod = await import(url)
    if (!mod.default || typeof mod.default !== 'object') {
        throw new Error(`Invalid schema in ${filePath}: missing or non-schema export`)
    }
    return { default: mod.default, meta: mod.meta }
}

function getSchemaFields(schema) {
    const searchFields = {}
    const filterFields = new Set()
    const userEditableFields = new Set()

    walk(schema)

    return {
        searchFields,
        filterFields,
        userEditableFields
    }

    function walk(node, prefix = '') {
        if (Array.isArray(node)) {
            if (node.length)
                walk(node[0], prefix)
            return
        }

        if (!node || typeof node !== 'object') return

        const isLeaf = typeof node.search === 'number' ||
            node.filter === true ||
            node.userEditable === true

        if (isLeaf) {
            if (typeof node.search === 'number')
                searchFields[prefix] = node.search

            if (node.filter === true)
                filterFields.add(prefix)

            if (node.userEditable === true)
                userEditableFields.add(prefix)

            return
        }

        for (const [key, value] of Object.entries(node)) {
            const path = prefix ? `${prefix}.${key}` : key
            walk(value, path)
        }
    }
}

async function ensureSearchIndex(
    Model,
    fields,
    type = 'autocomplete'
) {
    try {
        const name = Model.getSearchIndexName()

        const definition = {
            mappings: {
                dynamic: false,
                fields: Object.fromEntries(
                    Object.keys(fields).map(field => [
                        field,
                        { type }
                    ])
                )
            }
        }

        const existingList = typeof Model.listSearchIndexes === 'function'
            ? await Model.listSearchIndexes(name).catch(() => [])
            : []
        const existing = existingList[0]

        if (!existing) {
            if (typeof Model.createSearchIndex === 'function') {
                await Model.createSearchIndex({ name, definition }).catch(() => { })
            }
            return true
        }

        if (deepEqual(existing.latestDefinition, definition))
            return false

        if (typeof Model.updateSearchIndex === 'function') {
            await Model.updateSearchIndex(name, definition).catch(() => { })
        }

        return true
    } catch (e) {
        log.warn(`[SearchIndex] Skipped index for ${Model.modelName}:`, e?.message || e)
        return false
    }
}

function deepEqual(a, b) {
    return JSON.stringify(sortObject(a)) === JSON.stringify(sortObject(b))
}

function sortObject(obj) {
    if (Array.isArray(obj))
        return obj.map(sortObject)

    if (obj && typeof obj === 'object')
        return Object.keys(obj)
            .sort()
            .reduce((o, key) => {
                o[key] = sortObject(obj[key])
                return o
            }, {})

    return obj
}


function addIndexesFromMeta(schema, index) {
    if (Array.isArray(index)) {
        for (const idx of index) {
            try {
                if (Array.isArray(idx)) {
                    schema.index(...idx)
                } else {
                    schema.index(idx)
                }
            } catch (err) {
                console.error(`       ❌ Failed to create index:`, err.message)
            }
        }
    } else {
        // Fallback for non-array index
        try {
            schema.index(index)
        } catch (err) {
            console.error(`       ❌ Failed to create index:`, err.message)
        }
    }
}

function addHooksFromMeta(schema, hooks) {
    for (const [hookType, hookFunctions] of Object.entries(hooks)) {
        for (const [hookName, hookFunction] of Object.entries(hookFunctions)) {
            if (typeof hookFunction === 'function') {
                schema[hookType](hookName, hookFunction)
            } else if (Array.isArray(hookFunction)) {
                for (const fn of hookFunction) {
                    if (typeof fn === 'function') {
                        schema[hookType](hookName, fn)
                    }
                }
            }
        }
    }
}

function createMongooseSchema(schema, meta) {
    if (!meta?.noId)
        schema.id = {
            type: String,
            default: () => uid(),
            unique: true,
            filter: true
        }
    if (!meta?.noActive)
        schema.active = {
            type: Boolean,
            default: true,
            filter: true
        }

    const mongooseSchema = new Schema(schema, {
        versionKey: false,
        timestamps: meta?.timestamps ?? true
    })

    if (meta?.index) {
        addIndexesFromMeta(mongooseSchema, meta.index)
    }

    if (meta?.virtuals) {
        for (const [name, getter] of Object.entries(meta.virtuals)) {
            mongooseSchema.virtual(name).get(getter)
        }
        // mongooseSchema.plugin(mongooseLeanVirtuals) - optional plugin for lean queries if needed
    }
    if (meta?.hooks) {
        addHooksFromMeta(mongooseSchema, meta.hooks)
    }
    return mongooseSchema
}

/**
 * Create a Mongoose model from a loaded schema and register indexes.
 */
async function createModelFromSchema(schemaPath) {
    const filePath = path.resolve(SCHEMAS_DIR, schemaPath)
    if (!fs.existsSync(filePath)) {
        console.warn(`[WARN] Schema file not found: ${filePath}`)
        return null
    }

    // Extract the base name without extension (e.g., "user", "sale_kind")
    const fileName = path.basename(schemaPath, '.js')

    const { default: schema, meta } = await loadSchemaFile(filePath)

    // Derive model name (PascalCase) and collection name (snake_case plural)
    const modelName = toPascalCase(fileName)
    const collectionName = toSnakeCasePlural(toSnakeCase(modelName))

    const mongooseSchema = createMongooseSchema(schema, meta)
    // Create the Mongoose model with explicit collection name
    const Model = mongoose.model(modelName, mongooseSchema, collectionName)
    if (meta?.constants) Model.constants = meta.constants
    if (meta?.cacheStrategy) {
        Model.cacheName = collectionName
        Model.cacheStrategy = meta.cacheStrategy
    }
    if (meta?.defaultSelect) Model.defaultSelect = meta.defaultSelect
    if (meta?.defaultSelectOne) Model.defaultSelectOne = meta.defaultSelectOne
    if (meta?.defaultSort) Model.defaultSort = meta.defaultSort
    if (meta?.methods) Model.methods = meta?.methods(Model)

    const {
        searchFields,
        filterFields,
        userEditableFields
    } = getSchemaFields(schema)

    if (Object.keys(searchFields).length) {
        Model.getSearchIndexName = () => `${collectionName}_search`
        await ensureSearchIndex(Model, searchFields)
        Model.searchFields = searchFields
    }

    if (filterFields.size)
        Model.filterFields = filterFields

    Model.processFilter = (filter, search) => {
        const processed = { ...filter }
        Object.keys(processed).forEach(key => {
            if (key === '$or') return // allow search-generated $or
            if (!Model.filterFields?.has(key))
                delete processed[key]
            else {
                const val = processed[key]
                // ponytail: per-field string prefix search — "^value" (case-insensitive, escaped)
                if (typeof val === 'string') {
                    if (get(schema, `${key}.type`) === String) {
                        const trimmed = val.trim()
                        if (!trimmed) { delete processed[key]; return }
                        const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                        processed[key] = new RegExp('^' + escaped, 'i')
                    }
                    return
                }
                // sanitize operator objects: allow $in, $gte, $lte, $gt, $lt
                if (val && typeof val === 'object' && !(val instanceof RegExp) && !Array.isArray(val)) {
                    const allowed = {}
                    if (Array.isArray(val.$in)) {
                        if (val.$in.length) allowed.$in = val.$in
                        else { delete processed[key]; return }
                    }
                    if (val.$gte != null) allowed.$gte = val.$gte
                    if (val.$lte != null) allowed.$lte = val.$lte
                    if (val.$gt != null) allowed.$gt = val.$gt
                    if (val.$lt != null) allowed.$lt = val.$lt
                    if (Object.keys(allowed).length) processed[key] = allowed
                    else {
                        // no recognized operator — keep only if it's a plain value object (unlikely)
                        // treat as no-op to avoid injection
                        delete processed[key]
                    }
                }
            }
        })

        if (search?.length && Model.filterFields) {
            for (const field of Model.filterFields) {
                if (get(schema, `${field}.type`) === String) {
                    if (!processed.$or) processed.$or = []
                    processed.$or.push({ [field]: new RegExp(search) })
                }
            }
        }
        return processed
    }

    if (userEditableFields.size)
        Model.userEditableFields = userEditableFields

    return Model
}

/**
 * Scan the schemas folder and create all models.
 */
export default async function createModels(redis) {
    if (!fs.existsSync(SCHEMAS_DIR)) {
        console.error(`❌ Schemas directory not found: ${SCHEMAS_DIR}`)
        process.exit(1)
    }

    const files = fs.readdirSync(SCHEMAS_DIR).filter(f => f.endsWith('.js'))
    if (files.length === 0) {
        console.log('⚠️ No .js schema files found in schemas/')
        return []
    }

    const models = {}

    await Promise.all(files.map(async file => {
        try {
            const model = await createModelFromSchema(file)
            if (model) {
                models[model.modelName] = model
                if (model.cacheStrategy && redis?.init) {
                    try {
                        model.cache = await redis.init(model)
                    } catch (cacheInitErr) {
                        log.warn(`Cache init failed for ${model.modelName}:`, cacheInitErr?.message || cacheInitErr)
                    }
                }
                if (model.cacheStrategy === CACHE_STRATEGIES.HASHSET && redis?.hlen && model.cache) {
                    try {
                        const [
                            currentHashCount,
                            currentDocsCount
                        ] = await Promise.all([
                            redis.hlen(model.cacheName).catch(() => 0),
                            model.countDocuments().catch(() => 0)
                        ])

                        if (currentHashCount != currentDocsCount) {
                            try {
                                const docs = await model.find({}, { _id: 0 }).lean()
                                await model.cache.add(docs)
                            } catch (e) {
                                log.error('Cache seeding error:', e)
                            }
                        }
                    } catch (seedErr) {
                        log.warn('Cache check warning:', seedErr?.message || seedErr)
                    }
                }
            }
        } catch (err) {
            console.error(`\n💥 Failed to process ${file}:`, err.message)
        }
    }))

    return models
}