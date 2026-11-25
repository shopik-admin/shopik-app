import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createStreetIndex, normalizeSearch } from '../../server/external/addressProvider/streetIndex.js'

function makeModel(docs) {
    const counts = { find: 0, distinct: 0 }
    const Model = {
        distinct: async () => {
            counts.distinct += 1
            return [...new Set(docs.map(doc => doc.city))]
        },
        find: filter => {
            counts.find += 1
            return {
                select: () => ({
                    lean: async () => docs.filter(doc => doc.city === filter.city)
                })
            }
        }
    }
    return { Model, counts }
}

const beitar = [
    { city: 'ביתר עילית', street: 'יוחנן בן זכאי', aliases: ['בן זכאי', 'רבן יוחנן בן זכאי'] },
    { city: 'ביתר עילית', street: 'הגר"א', aliases: ['הגרא'] },
    { city: 'ביתר עילית', street: 'רבי עקיבא', aliases: [] }
]

describe('street index', () => {
    it('normalizes quotes, gershayim and dashes for matching', () => {
        assert.equal(normalizeSearch('  הגר"א '), 'הגרא')
        assert.equal(normalizeSearch('ז׳בוטינסקי'), 'זבוטינסקי')
        assert.equal(normalizeSearch('בן-גוריון'), 'בן גוריון')
    })

    it('answers repeated searches from memory (one Mongo read per city)', async () => {
        const { Model, counts } = makeModel(beitar)
        const index = createStreetIndex({ Model })

        const first = await index.search({ q: 'בן ז', type: 'street', city: 'ביתר עילית' })
        const second = await index.search({ q: 'עקיבא', type: 'street', city: 'ביתר עילית' })

        assert.equal(counts.find, 1)
        assert.equal(first[0].label, 'יוחנן בן זכאי')
        assert.equal(first[0].hint, 'בן זכאי')
        assert.equal(second[0].label, 'רבי עקיבא')
    })

    it('offers only the official street name, with the alias as a hint', async () => {
        const { Model } = makeModel(beitar)
        const index = createStreetIndex({ Model })

        const results = await index.search({ q: 'רבן יוחנן', city: 'ביתר עילית' })
        assert.equal(results.length, 1)
        assert.equal(results[0].street, 'יוחנן בן זכאי')
        assert.equal(results[0].hint, 'רבן יוחנן בן זכאי')
    })

    it('matches the official name even when the alias has punctuation', async () => {
        const { Model } = makeModel(beitar)
        const index = createStreetIndex({ Model })

        const results = await index.search({ q: 'הגרא', city: 'ביתר עילית' })
        assert.equal(results[0].label, 'הגר"א')
        assert.equal(results[0].hint, undefined)
    })

    it('caches the city list separately from the streets', async () => {
        const { Model, counts } = makeModel(beitar)
        const index = createStreetIndex({ Model })

        const first = await index.search({ q: 'בית', type: 'city' })
        const second = await index.search({ q: 'ביתר ע', type: 'city' })

        assert.equal(counts.distinct, 1)
        assert.equal(first[0].city, 'ביתר עילית')
        assert.equal(second[0].city, 'ביתר עילית')
    })

    it('reloads after the TTL expires', async () => {
        let now = 0
        const { Model, counts } = makeModel(beitar)
        const index = createStreetIndex({ Model, ttlMs: 100, clock: () => now })

        await index.search({ q: 'הר', city: 'ביתר עילית' })
        now = 50
        await index.search({ q: 'הר', city: 'ביתר עילית' })
        assert.equal(counts.find, 1)

        now = 101
        await index.search({ q: 'הר', city: 'ביתר עילית' })
        assert.equal(counts.find, 2)
    })

    it('evicts the least recently used city from the LRU', async () => {
        const docs = [
            ...beitar,
            { city: 'חולון', street: 'הרוקמים', aliases: [] }
        ]
        const { Model, counts } = makeModel(docs)
        const index = createStreetIndex({ Model, maxCities: 1 })

        await index.search({ q: 'הר', city: 'ביתר עילית' })
        await index.search({ q: 'הר', city: 'חולון' })
        await index.search({ q: 'הר', city: 'ביתר עילית' })

        assert.equal(counts.find, 3)
    })

    it('shares one in-flight query between concurrent cold requests', async () => {
        let release
        let findCalls = 0
        const Model = {
            distinct: async () => [],
            find: () => {
                findCalls += 1
                return {
                    select: () => ({
                        lean: () => new Promise(resolve => {
                            release = () => resolve([{ city: 'A', street: 'Herzl', aliases: [] }])
                        })
                    })
                }
            }
        }
        const index = createStreetIndex({ Model })

        const first = index.search({ q: 'Her', city: 'A' })
        const second = index.search({ q: 'Her', city: 'A' })
        // let both requests reach the pending map before the query resolves
        await Promise.resolve()
        release()
        const [a, b] = await Promise.all([first, second])

        assert.equal(findCalls, 1)
        assert.equal(a[0].street, 'Herzl')
        assert.equal(b[0].street, 'Herzl')
    })

    it('clears the cache when asked (after an import)', async () => {
        const { Model, counts } = makeModel(beitar)
        const index = createStreetIndex({ Model })

        await index.search({ q: 'הר', city: 'ביתר עילית' })
        index.clear()
        await index.search({ q: 'הר', city: 'ביתר עילית' })

        assert.equal(counts.find, 2)
    })

    it('caps the result size', async () => {
        const docs = Array.from({ length: 40 }, (_, i) => ({
            city: 'A',
            street: `רחוב ${String(i).padStart(2, '0')}`,
            aliases: []
        }))
        const { Model } = makeModel(docs)
        const index = createStreetIndex({ Model })

        const results = await index.search({ q: 'רחוב', city: 'A', limit: 100 })
        assert.equal(results.length, 20)
    })
})
