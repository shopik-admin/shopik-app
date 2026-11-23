// Route discovery mirroring server/router.js: every file under server/api with a
// default-exported function is a live route at <dir-path>/<action>. We import the
// files (no side effects — connections only happen in boot) to read each route's
// config for auth/permission classification.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isReadOnlyRoute, ALSO_READ, NEVER_RUN } from '#server/utils/routeKind.js'

const API_DIR = path.resolve(import.meta.dirname, '../../server/api')

// Translation writes/import/export are handled by scripts/stress/translations.js
// instead of the generic sweep: export generates a file, import carries a file
// payload, and the mutation routes must not run with a guessed key.
const TRANSLATION_READ_ROUTES = new Set([
    'translation/dictionary',
    'translation/languages',
    'translation/read'
])

function walk(dir, prefix = '') {
    const out = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel))
        else if (entry.isFile() && entry.name.endsWith('.js')) out.push({ file: path.join(dir, entry.name), route: rel.replace(/\.js$/, '') })
    }
    return out
}

export async function discoverRoutes({ only = null, mutations = false } = {}) {
    const routes = []
    for (const { file, route } of walk(API_DIR)) {
        let mod
        try {
            mod = await import(pathToFileURL(file).href)
        } catch (err) {
            routes.push({ route, unusable: `import failed: ${err.message}` })
            continue
        }
        const handler = mod.default
        if (typeof handler !== 'function') continue // helper file, the router skips it too
        const config = handler.config || {}
        const readOnly = isReadOnlyRoute(route)
        if (!readOnly && !mutations) continue
        if (NEVER_RUN.has(route.split('/').pop())) continue
        if (route.startsWith('translation/') && !TRANSLATION_READ_ROUTES.has(route)) continue
        if (only && !new RegExp(only).test(route)) continue
        routes.push({
            route,
            readOnly,
            alsoRead: ALSO_READ.has(route),
            permissions: [].concat(config.permissions || []),
            auth: config.auth || null,
            preventMultiple: Boolean(config.preventMultiple)
        })
    }
    routes.sort((a, b) => a.route.localeCompare(b.route))
    return routes
}
