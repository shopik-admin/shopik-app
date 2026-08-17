export default function diff(oldObj, newObj) {
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
        } else if (typeof oldVal === 'object' && typeof newVal === 'object') {
            const nestedDiff = diff(oldVal, newVal)
            if (Object.keys(nestedDiff).length > 0) {
                result[key] = newVal
            }
        } else {
            if (newVal != oldVal) {
                result[key] = newVal
            }
        }
    }

    return result
}