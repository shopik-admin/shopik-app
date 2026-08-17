/**
 * Generic utility to process large arrays in sequential batches.
 * 
 * @param {Array} items - The items to batch process.
 * @param {Function} op - Function that takes a batch array and returns a Promise.
 * @param {number} batchSize - Number of items per batch (default: 5000).
 * @returns {Promise<Array>} Array of results returned by each batch operation call.
 */
export default async function executeInBatches(items, op, batchSize = 5000) {
    if (!items?.length) return []
    const results = []
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize)
        const batchResult = await op(batch)
        results.push(batchResult)
    }
    return results
}