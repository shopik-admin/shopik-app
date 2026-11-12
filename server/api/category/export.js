import { exportCategoryMap } from '#server/services/categoryMap/index.js'

/**
 * Export the current category tree + sub-group map as a category-map CSV.
 * The file is a valid input for `category/import`: editing it and uploading it
 * back is how bulk reassignments and reorders are done.
 */
export default async function exportCategories(payload, { DL }) {
    const { csv, counts } = await exportCategoryMap({ DL })

    return {
        csv,
        filename: `category-map-${new Date().toISOString().slice(0, 10)}.csv`,
        ...counts
    }
}

exportCategories.config = {
    permissions: ['category:read']
}
