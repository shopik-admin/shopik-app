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
    // Construct the index name based on the collection's actual name
    const indexName = Model.getSearchIndexName()

    const shouldClauses = Object.entries(Model.searchFields).flatMap(([path, boost]) => [{
        autocomplete: {
            query,
            path,
            score: {
                boost: {
                    value: boost * 2 // Uses the weight defined in Model.searchFields (e.g., 'name': 10)
                }
            }
        }
    }, {
        autocomplete: {
            query,
            path,
            fuzzy: { maxEdits: 1, prefixLength: 2 },
            score: {
                boost: {
                    value: boost // Uses the weight defined in Model.searchFields (e.g., 'name': 10)
                }
            }
        }
    }])

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