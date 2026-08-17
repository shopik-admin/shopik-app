import { pathToFileURL } from 'url'
import path from 'path'
import fs from 'fs'

export default async function loadDir(baseDir, dirPath = '') {
    const result = {}
    const fullPath = path.join(baseDir, dirPath)

    if (!fs.existsSync(fullPath)) return result

    const entries = await fs.promises.readdir(fullPath, { withFileTypes: true })

    for (const entry of entries) {
        const entryRelativePath = path.join(dirPath, entry.name)

        if (entry.isDirectory()) {
            const subTree = await loadDir(baseDir, entryRelativePath)
            if (Object.keys(subTree).length > 0) result[entry.name] = subTree
        } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
            const fileFullPath = path.join(fullPath, entry.name)
            const fileUrl = pathToFileURL(fileFullPath).href
            const module = await import(fileUrl)
            const nameWithoutExt = path.basename(entry.name, path.extname(entry.name))

            let processed = {}
            const keys = Object.getOwnPropertyNames(module)

            if (module.default !== undefined) {
                if (typeof module.default === 'object' && module.default !== null) {
                    processed = Array.isArray(module.default) ? [...module.default] : { ...module.default }
                } else {
                    processed = module.default
                }

                if (typeof processed === 'object' && processed !== null) {
                    for (const key of keys) {
                        if (key !== 'default') processed[key] = module[key]
                    }
                }
            } else {
                for (const key of keys) processed[key] = module[key]
            }

            result[nameWithoutExt] = processed
        }
    }

    return result
}