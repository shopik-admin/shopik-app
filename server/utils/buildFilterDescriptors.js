/**
 * Build filter descriptors from a Mongoose Model.
 * Reads Model.filterFields (populated via filter:true) and introspects Model.schema paths
 * to infer UI type. MAIN_FIELDS controls `main` + `order`.
 */
export default function buildFilterDescriptors(ModelOrDL, mainFields = []) {
    // ponytail: accept both DL.Order (wrapper) and DL.Order.Model (mongoose model)
    const Model = ModelOrDL?.Model && !ModelOrDL?.filterFields ? ModelOrDL.Model : ModelOrDL
    if (!Model?.filterFields) return []

    const descriptors = []

    for (const key of Model.filterFields) {
        // skip auto id/active unless explicitly requested as main
        if ((key === 'id' || key === 'active') && !mainFields.includes(key)) continue

        const schematype = Model.schema.path(key)
        let type = 'string'
        let options

        if (schematype) {
            const instance = schematype.instance
            if (instance === 'Boolean') type = 'boolean'
            else if (instance === 'Date') type = 'date'
            else if (instance === 'Number') type = 'number'
            else if (instance === 'String') {
                if (schematype.enumValues?.length) {
                    type = 'enum'
                    options = [...schematype.enumValues]
                } else {
                    type = 'string'
                }
            } else if (instance === 'Array') {
                // e.g. [String] with enum — treat as enum
                const caster = schematype.caster
                if (caster?.enumValues?.length) {
                    type = 'enum'
                    options = [...caster.enumValues]
                }
            }
        }

        // overrides per domain knowledge
        if (key === 'window.date') {
            type = 'date'
            options = undefined
        } else if (key === 'storeId') {
            type = 'store'
            options = undefined
        }

        descriptors.push({
            key,
            labelKey: key,
            type,
            options,
            main: mainFields.includes(key),
            order: mainFields.indexOf(key)
        })
    }

    // sort: mains first by MAIN_FIELDS order, then rest alphabetically
    descriptors.sort((a, b) => {
        if (a.main && !b.main) return -1
        if (!a.main && b.main) return 1
        if (a.main && b.main) return a.order - b.order
        return a.key.localeCompare(b.key)
    })

    return descriptors
}
