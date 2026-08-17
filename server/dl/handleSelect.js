import get from '#common/functions/get.js'

const handleDoc = (doc, include, entries) => {
    const result = include
        ? {}
        : structuredClone(doc)

    for (const [path, value] of entries) {
        if (include) {
            if (!value) continue

            const field = get(doc, path)

            if (field !== undefined)
                set(result, path, field)
        } else {
            if (value) continue

            unset(result, path)
        }
    }

    return result
}

export default function handleSelect(docs, select = {}) {
    if (!docs) return docs
    const entries = Object.entries(select)
        .filter(([key]) => key !== '_id')

    if (entries.length === 0)
        return docs

    const include = entries.some(([, value]) => value)
    if (Array.isArray(docs)) {
        return docs.map(doc => handleDoc(doc, include, entries))
    } else if (typeof docs === 'object') {
        return handleDoc(docs, include, entries)
    }
}

function set(obj, path, value) {
    const parts = path.split('.')
    let current = obj

    for (let i = 0; i < parts.length - 1; i++) {
        current = current[parts[i]] ??= {}
    }

    current[parts.at(-1)] = value
}

function unset(obj, path) {
    const parts = path.split('.')
    let current = obj

    for (let i = 0; i < parts.length - 1; i++) {
        current = current?.[parts[i]]
        if (current == null)
            return
    }

    delete current[parts.at(-1)]
}