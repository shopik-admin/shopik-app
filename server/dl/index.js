import loadDir from '#common/functions/loadDir.js'
import createModels from './createModels.js'
import connect from './connect.js'

export default async function createDL(__dirname) {
    const { redis } = await connect()
    const
        [defaults, models] = await Promise.all([
            loadDir(__dirname, './dl/defaults'),
            createModels(redis)
        ]),
        DL = { redis }

    for (let entry of Object.entries(models)) {
        const [modelName, Model] = entry
        DL[modelName] = {
            Model,
            constants: Model.constants,
            defaultSelect: Model.defaultSelect,
            defaultSelectOne: Model.defaultSelectOne
        }
        if (Model.methods) {
            for (const [name, func] of Object.entries(Model.methods)) {
                DL[modelName][name] = func
            }
            delete Model.methods
        }
        for (let [name, factory] of Object.entries(defaults)) {
            const func = factory(Model)
            DL[modelName][name] = func
        }
    }

    DL.populate = async function populate(docs, docField, sourceMap) {
        if (!docs?.length) return docs
        if (!sourceMap || !Object.keys(sourceMap).length) return docs
        if (!docField.endsWith('Id')) return docs

        const [model] = docField.split('Id')
        if (!model) return docs

        const modelName = `${model[0].toUpperCase()}${model.slice(1)}`
        const Model = DL[modelName]?.Model
        if (!Model) return docs

        const sourceIds = docs.map(doc => doc[docField]).filter(Boolean)
        if (sourceIds.length === 0) return docs

        const sourceKeys = Object.keys(sourceMap)
        const sourceEntries = Object.entries(sourceMap)
        const select = Object.fromEntries(sourceKeys.map(key => [key, 1]))
        select.id = 1

        let sources = await Model.cache.get(sourceIds, select)
        if (!sources?.length) {
            sources = await DL[modelName].read({ id: sourceIds }, { ...select, _id: 0 })
        }
        if (sources?.length) {
            const sourceHash = sources.reduce((acc, source) => ({ ...acc, [source.id]: source }), {})

            return docs.map(doc => ({
                ...doc,
                ...Object.fromEntries(
                    sourceEntries.map(([sourceKey, docKey]) => {
                        let transformer,
                            key = docKey
                        if (typeof docKey === 'object') {
                            key = docKey.key
                            transformer = docKey.format
                        }
                        const id = doc[docField]
                        const sourceValue = sourceHash[id]?.[sourceKey]
                        if (sourceValue === undefined) return null

                        const value = transformer?.(sourceValue) ?? sourceValue
                        return [key, value]
                    }).filter(Boolean)
                )
            }))
        }
    }

    return DL
}
