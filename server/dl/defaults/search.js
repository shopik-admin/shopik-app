const searchFieldRegex = /[^\d\sA-Za-zא-ת%.]/g
const separatorRegex = /[-,/\\]/g

/**
 * Generates a MongoDB Atlas Search query object based on the Model's configuration.
 * 
 * @param {Object} Model - The Mongoose/Model instance containing collection info and searchFields config.
 * @param {string} query - The sanitized search string (e.g., "red 50% off").
 * @returns {Object} The $search object ready to be used in a query pipeline.
 */
function buildSearchQuery(Model, query) {
    const indexName = Model.getSearchIndexName()

    // Schema-driven tiered ranking:
    // - search: autocomplete boost (e.g. name:30, label:8)
    // - searchPrefixBoost: sequential prefix boost on dual-type field (edgeGram keyword) (e.g. name:100, label:15)
    // - searchFuzzy: typo-tolerant autocomplete (e.g. name:3, label:1)
    // Product schema now defines all tiers explicitly; other models fallback to generic.
    const shouldClauses = []

    // Prefix boosts (sequential = field starts with query) — highest tier
    if (Model.searchPrefixFields) {
        for (const [path, boost] of Object.entries(Model.searchPrefixFields)) {
            shouldClauses.push({
                autocomplete: {
                    query,
                    path,
                    tokenOrder: 'sequential',
                    score: { boost: { value: boost } }
                }
            })
        }
    }

    // Regular autocomplete per search field — generic models double-weight autocomplete vs fuzzy (boost*2 / boost)
    const hasPrefixForWeight = Model.searchPrefixFields && Object.keys(Model.searchPrefixFields).length > 0
    for (const [path, boost] of Object.entries(Model.searchFields || {})) {
        const autocompleteBoost = hasPrefixForWeight ? boost : boost * 2
        shouldClauses.push({
            autocomplete: {
                query,
                path,
                score: { boost: { value: autocompleteBoost } }
            }
        })
    }

    // Fuzzy — explicit per-field if defined (product: name:3, label:1), otherwise generic fallback for other models
    if (Model.searchFuzzyFields && Object.keys(Model.searchFuzzyFields).length) {
        for (const [path, boost] of Object.entries(Model.searchFuzzyFields)) {
            shouldClauses.push({
                autocomplete: {
                    query,
                    path,
                    fuzzy: { maxEdits: 1, prefixLength: 2 },
                    score: { boost: { value: boost } }
                }
            })
        }
    } else if (Model.searchFields) {
        // Generic fuzzy for non-product models that don't define searchFuzzy
        const hasFuzzy = Model.searchFuzzyFields && Object.keys(Model.searchFuzzyFields).length > 0
        const hasPrefix = Model.searchPrefixFields && Object.keys(Model.searchPrefixFields).length > 0
        if (!hasFuzzy && !hasPrefix) {
            for (const [path, boost] of Object.entries(Model.searchFields)) {
                shouldClauses.push({
                    autocomplete: {
                        query,
                        path,
                        fuzzy: { maxEdits: 1, prefixLength: 2 },
                        score: { boost: { value: boost } }
                    }
                })
            }
        }
    }

    return {
        $search: {
            index: indexName,
            compound: {
                should: shouldClauses,
                minimumShouldMatch: 1
            }
        }
    }
}

export default (Model) => async function search(value = '', filter, options = {}) {
    if (!value || typeof value !== 'string') return []
    if (!Model.searchFields)
        throw { status: 400, message: 'model does not support search' }

    const { skip = 0, limit = 50, select } = options

    const sanitizedWords = value
        .toLowerCase()
        .replace(separatorRegex, ' ')
        .replace(searchFieldRegex, '')
        .replace(/\s+/g, ' ')
        .split(/\s+/)
        .map(v => v
            .replace(/(^| )\D+\d*%($| )/g, '')
            .replace(/(^| )%\d*\D+($| )/g, '')
            .replace(/(\D+)%/g, '$1')
            .replace(/%(\D+)/g, '$1')
            .replace(/%(\d+)/g, '$1%')
        )
        .filter(v => v.length > 1)
        .slice(0, 3)

    if (!sanitizedWords.length) return []

    const sanitizedValue = sanitizedWords.join(' ')
    const searchStage = buildSearchQuery(Model, sanitizedValue,)

    const projection = select || Model.defaultSelect
    const sort = Model.defaultSort || {}
    const pipe = [
        searchStage,
        ...(filter ? [{ $match: filter }] : []),
        ...(projection ?
            [{
                $project: {
                    _id: 0,
                    ...projection,
                    ...sort,
                    searchScore: { $meta: 'score' }
                }
            }] :
            [{
                $addFields: {
                    searchScore: { $meta: 'score' }
                }
            }]
        ),
        { $sort: { searchScore: -1, ...sort } },
        { $skip: Number(skip) },
        { $limit: Number(limit) }
    ]
    if (projection) {
        pipe.push({ $project: projection })
    }

    return Model.aggregate(pipe)
}