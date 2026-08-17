export default function get(obj, path, defaultValue = undefined) {
    if (!obj || typeof path !== 'string') return defaultValue
    const keys = path.split('.')

    return keys.reduce((value, key) => {
        if (value == null) return defaultValue

        if (Array.isArray(value))
            return value.flatMap(item => item?.[key]).filter(v => v !== undefined)

        return value[key]
    }, obj)
}