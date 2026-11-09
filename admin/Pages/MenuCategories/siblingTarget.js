const MAX_HOPS = 10

/**
 * Reorder is sibling-only, but the row under the pointer is usually a child of
 * the sibling the user meant. Walk up from the hovered node to the closest
 * ancestor that shares the dragged node's parent — otherwise a drop between
 * two top-level categories lands on a sub-category and is refused.
 *
 * Returns the id to drop onto, or null when the drop is not a reorder.
 */
export function siblingTargetFor(dragged, overId, byId) {
    if (!dragged?.id || !overId) return null

    const parentId = dragged.parentId || null
    let id = overId

    for (let hop = 0; id && hop < MAX_HOPS; hop++) {
        const node = byId.get(id)
        if (!node) return null
        if ((node.parentId || null) === parentId)
            return node.id === dragged.id ? null : node.id
        id = node.parentId || null
    }

    return null
}
