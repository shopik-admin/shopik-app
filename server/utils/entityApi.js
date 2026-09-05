// Factories for the standard per-entity CRUD endpoints (read / count / id / filters)
// plus applyEntityRoutes(), which dynamically registers the routes declared in
// server/utils/entityRouteConfig.js. Custom handlers in server/api/<entity>/<op>.js
// always win over generated ones. Custom endpoints keep their own files.
import buildFilterDescriptors from '#server/utils/buildFilterDescriptors.js'
import { toPascalCase } from '#common/functions/naming.js'

export function makeRead(modelName, permissions = [], extraConfig = {}) {
    const read = (payload, { DL }) => {
        const { filter = {}, select } = payload
        return DL[modelName].read(filter, select, payload)
    }
    read.config = { ...extraConfig, permissions }
    return read
}

export function makeCount(modelName, permissions = [], extraConfig = {}) {
    const count = ({ filter, search }, { DL }) => DL[modelName].count(filter, search)
    count.config = { ...extraConfig, permissions }
    return count
}

export function makeId(modelName, permissions = [], extraConfig = {}) {
    const id = ({ id }, { DL }) => DL[modelName].readById(id)
    id.config = { ...extraConfig, required: ['id'], permissions }
    return id
}

export function makeFilters(modelName, MAIN_FIELDS = [], permissions = [], extraConfig = {}) {
    const filters = (payload, { DL }) => buildFilterDescriptors(DL[modelName], MAIN_FIELDS)
    filters.config = { ...extraConfig, permissions }
    return filters
}

const MAKERS = { read: makeRead, count: makeCount, id: makeId }

/**
 * Register the standard routes declared in entityRouteConfig.js onto the api tree.
 * Only ops that don't already have a handler (i.e. no file defined one) are generated.
 */
export function applyEntityRoutes(api, registry = {}) {
    for (const [route, entry] of Object.entries(registry)) {
        const parts = route.split('/')
        const modelName = entry.model ?? toPascalCase(parts.at(-1))
        const entity = parts.at(-1)

        let node = api
        for (const part of parts) {
            if (typeof node[part] !== 'object' || node[part] === null) node[part] = {}
            node = node[part]
        }

        for (const op of entry.ops ?? []) {
            if (typeof node[op] === 'function') continue
            const permissions = op === 'id'
                ? [`${entity}:id`]
                : entry.permissions ?? [`${entity}:read`]
            node[op] = MAKERS[op](modelName, permissions, entry.configs?.[op] ?? entry.config)
        }

        if (entry.filters && typeof node.filters !== 'function') {
            const permissions = entry.permissions ?? [`${entity}:read`]
            node.filters = makeFilters(modelName, entry.filters, permissions, entry.configs?.filters ?? entry.config)
        }
    }
    return api
}
