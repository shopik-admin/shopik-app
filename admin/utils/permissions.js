// Groups a flat permission list ('category:action') into
// { category: [{ action, fullValue }] }, sorted alphabetically.
// Does not mutate the input list.
export function groupPermissions(list) {
    const groups = {}
    list.slice().sort().forEach(permission => {
        const [category, action] = permission.split(':')
        if (!category) return
        if (!groups[category]) groups[category] = []
        groups[category].push({ action: action || 'all', fullValue: permission })
    })
    return groups
}
