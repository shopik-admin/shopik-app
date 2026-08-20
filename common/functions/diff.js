export default function diff(oldObj, newObj) {
    if (oldObj === newObj) return {}

    // Primitives (and null) can't be recursed into: Object.keys(number) is empty,
    // which silently swallowed numeric changes. Compare them directly instead.
    if (typeof oldObj !== 'object' || oldObj === null || typeof newObj !== 'object' || newObj === null) {
        return { value: true }
    }

    const result = {}

    for (const key of Object.keys(newObj)) {
        const oldVal = oldObj[key]
        const newVal = newObj[key]

        if (Array.isArray(oldVal) && Array.isArray(newVal)) {
            let changed = oldVal.length != newVal.length
            if (!changed)
                for (let i = 0; i < newVal.length; i++) {
                    const nestedDiff = diff(oldVal[i], newVal[i])
                    if (Object.keys(nestedDiff).length > 0) {
                        changed = true
                        break
                    }
                }
            if (changed) {
                result[key] = newVal
            }
        } else {
            const nestedDiff = diff(oldVal, newVal)
            if (Object.keys(nestedDiff).length > 0) {
                result[key] = newVal
            }
        }
    }

    return result
}