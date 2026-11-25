import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { isGoogleResultValid, resolveAddress } from '../../server/external/geocode.js'
import { resetGovmapState } from '../../server/external/addressProvider/govmapApi.js'

const BEITAR_ADDRESS = 'POINT(3909284.970801354 3723246.7367266268)'
const BEITAR_STREET = 'POINT(3909156.8446921143 3723164.2740610833)'
const BEITAR_STREET_LNG = 35.11770439249593
const BEITAR_STREET_LAT = 31.694280358429598

const realFetch = globalThis.fetch
const savedEnv = {
    url: process.env.GOVMAP_SEARCH_URL,
    timeout: process.env.GOVMAP_TIMEOUT_MS,
    provider: process.env.ADDRESS_GEOCODE_PROVIDER,
    googleKey: process.env.GOOGLE_MAPS_API_KEY,
    anchor: process.env.GOOGLE_ANCHOR_MAX_M
}

beforeEach(() => {
    process.env.GOVMAP_SEARCH_URL = 'https://govmap.test/search-service/autocomplete'
    process.env.GOVMAP_TIMEOUT_MS = '50'
    process.env.ADDRESS_GEOCODE_PROVIDER = 'govmap'
    process.env.GOOGLE_MAPS_API_KEY = 'test-key'
    process.env.GOOGLE_ANCHOR_MAX_M = '2000'
    resetGovmapState()
})

afterEach(() => {
    globalThis.fetch = realFetch
    for (const [key, value] of Object.entries({
        GOVMAP_SEARCH_URL: savedEnv.url,
        GOVMAP_TIMEOUT_MS: savedEnv.timeout,
        ADDRESS_GEOCODE_PROVIDER: savedEnv.provider,
        GOOGLE_MAPS_API_KEY: savedEnv.googleKey,
        GOOGLE_ANCHOR_MAX_M: savedEnv.anchor
    })) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
    }
})

function makeDL() {
    const cache = new Map()
    return {
        cache,
        GeocodeCache: {
            readById: async id => cache.get(id) || null,
            updateOne: async (filter, update) => {
                cache.set(filter.id, update)
                return update
            }
        }
    }
}

function reply(data) {
    return { ok: true, json: async () => data }
}

function googleResponse({
    lat = 31.6945,
    lng = 35.118,
    accuracy = 'ROOFTOP',
    number = '3',
    locality = 'ביתר עילית'
} = {}) {
    const components = [
        { long_name: 'יוחנן בן זכאי', short_name: 'יוחנן בן זכאי', types: ['route'] },
        { long_name: locality, short_name: locality, types: ['locality'] },
        { long_name: 'ישראל', short_name: 'IL', types: ['country'] }
    ]
    if (number) components.unshift({ long_name: number, short_name: number, types: ['street_number'] })
    return {
        status: 'OK',
        results: [{
            formatted_address: `יוחנן בן זכאי ${number || ''}, ${locality}`,
            address_components: components,
            geometry: { location: { lat, lng }, location_type: accuracy },
            types: ['street_address']
        }]
    }
}

function stubFetch({ govmap = () => [], google = () => ({ status: 'ZERO_RESULTS', results: [] }) } = {}) {
    const calls = { govmap: 0, google: 0, googleUrl: null, govmapBodies: [] }
    globalThis.fetch = async (url, options = {}) => {
        const target = String(url)
        if (target.includes('govmap.test')) {
            calls.govmap += 1
            const body = JSON.parse(options.body)
            calls.govmapBodies.push(body)
            return reply({ results: govmap(body) || [] })
        }
        if (target.includes('maps.googleapis.com')) {
            calls.google += 1
            calls.googleUrl = target
            return reply(google())
        }
        throw new Error(`unexpected fetch ${target}`)
    }
    return calls
}

const exactAddress = () => ([{
    type: 'address',
    text: 'יוחנן בן זכאי 3 ביתר עילית',
    shape: BEITAR_ADDRESS
}])

const streetOnly = () => ([{
    type: 'street',
    text: 'יוחנן בן זכאי ביתר עילית',
    shape: BEITAR_STREET
}])

const parts = { city: 'ביתר עילית', street: 'יוחנן בן זכאי', building: '3' }

describe('resolveAddress chain', () => {
    it('returns a cached point without any provider call', async () => {
        const DL = makeDL()
        DL.cache.set('ביתר עילית:יוחנן בן זכאי:3', {
            location: { type: 'Point', coordinates: [BEITAR_STREET_LNG, BEITAR_STREET_LAT] },
            accuracy: 'ROOFTOP',
            source: 'govmap'
        })
        const calls = stubFetch()

        const result = await resolveAddress({ DL, ...parts })

        assert.equal(calls.govmap, 0)
        assert.equal(calls.google, 0)
        assert.equal(result.source, 'govmap')
        assert.equal(result.accuracy, 'ROOFTOP')
    })

    it('uses the GovMap exact house and never calls Google', async () => {
        const DL = makeDL()
        const calls = stubFetch({
            govmap: body => body.searchText === 'יוחנן בן זכאי 3 ביתר עילית' ? exactAddress() : []
        })

        const result = await resolveAddress({ DL, ...parts })

        assert.equal(calls.govmap, 1)
        assert.equal(calls.google, 0)
        assert.equal(result.source, 'govmap')
        assert.equal(result.accuracy, 'ROOFTOP')
        assert.ok(DL.cache.size === 1)
    })

    it('refines a street-level anchor with an anchored Google result', async () => {
        const DL = makeDL()
        const calls = stubFetch({
            govmap: body => body.searchText.includes('3') ? [] : streetOnly(),
            google: () => googleResponse()
        })

        const result = await resolveAddress({ DL, ...parts })

        assert.equal(calls.google, 1)
        assert.ok(calls.googleUrl.includes('bounds='))
        assert.ok(calls.googleUrl.includes('language=he'))
        assert.ok(calls.googleUrl.includes('region=il'))
        assert.equal(result.source, 'google')
        assert.equal(result.accuracy, 'ROOFTOP')
    })

    it('rejects a Google result in another city and keeps the street point', async () => {
        const DL = makeDL()
        stubFetch({
            govmap: body => body.searchText.includes('3') ? [] : streetOnly(),
            // Jerusalem, ~12km away from the anchored street
            google: () => googleResponse({ lat: 31.78, lng: 35.22 })
        })

        const result = await resolveAddress({ DL, ...parts })

        assert.equal(result.source, 'govmap')
        assert.equal(result.accuracy, 'STREET')
        assert.ok(Math.abs(result.location.coordinates[1] - BEITAR_STREET_LAT) < 0.001)
    })

    it('rejects an approximate Google match', async () => {
        const DL = makeDL()
        stubFetch({
            govmap: body => body.searchText.includes('3') ? [] : streetOnly(),
            google: () => googleResponse({ accuracy: 'APPROXIMATE' })
        })

        const result = await resolveAddress({ DL, ...parts })
        assert.equal(result.accuracy, 'STREET')
    })

    it('rejects a Google result with the wrong house number', async () => {
        const DL = makeDL()
        stubFetch({
            govmap: body => body.searchText.includes('3') ? [] : streetOnly(),
            google: () => googleResponse({ number: '31' })
        })

        const result = await resolveAddress({ DL, ...parts })
        assert.equal(result.accuracy, 'STREET')
    })

    it('returns null when GovMap has no street and Google is rejected', async () => {
        const DL = makeDL()
        stubFetch({
            govmap: () => [],
            google: () => googleResponse({ lat: 31.78, lng: 35.22, locality: 'ירושלים' })
        })

        const result = await resolveAddress({ DL, ...parts })
        assert.equal(result, null)
    })

    it('caches a street-level result and honours its TTL', async () => {
        const DL = makeDL()
        stubFetch({
            govmap: body => body.searchText.includes('3') ? [] : streetOnly(),
            google: () => ({ status: 'ZERO_RESULTS', results: [] })
        })

        const first = await resolveAddress({ DL, ...parts })
        assert.equal(first.accuracy, 'STREET')

        // expired street entry: 7 months old
        const key = 'ביתר עילית:יוחנן בן זכאי:3'
        const hit = DL.cache.get(key)
        hit.updatedAt = new Date(Date.now() - 1000 * 60 * 60 * 24 * 210).toISOString()

        const calls = stubFetch({
            govmap: body => body.searchText.includes('3') ? [] : streetOnly(),
            google: () => ({ status: 'ZERO_RESULTS', results: [] })
        })
        const second = await resolveAddress({ DL, ...parts })
        assert.equal(calls.govmap, 2)
        assert.equal(second.accuracy, 'STREET')
    })

    it('caches a street-only lookup under a star key', async () => {
        const DL = makeDL()
        stubFetch({
            govmap: () => streetOnly(),
            google: () => ({ status: 'ZERO_RESULTS', results: [] })
        })

        const result = await resolveAddress({ DL, city: 'ביתר עילית', street: 'יוחנן בן זכאי' })

        assert.equal(result.accuracy, 'STREET')
        assert.ok(DL.cache.has('ביתר עילית:יוחנן בן זכאי:*'))
    })

    it('resolves a text query through GovMap first', async () => {
        const DL = makeDL()
        const calls = stubFetch({ govmap: () => exactAddress() })

        const result = await resolveAddress({ DL, q: 'הרוקמים 26 חולון' })

        assert.equal(calls.govmap, 1)
        assert.equal(calls.google, 0)
        assert.equal(result.source, 'govmap')
    })
})

describe('Google result validation', () => {
    const base = {
        location: { type: 'Point', coordinates: [BEITAR_STREET_LNG, BEITAR_STREET_LAT] },
        accuracy: 'ROOFTOP',
        components: [
            { long_name: '3', types: ['street_number'] },
            { long_name: 'יוחנן בן זכאי', types: ['route'] },
            { long_name: 'ביתר עילית', types: ['locality'] }
        ]
    }

    it('accepts a precise in-city result', () => {
        assert.equal(isGoogleResultValid(base, { ...parts, anchor: [BEITAR_STREET_LNG, BEITAR_STREET_LAT] }), true)
    })

    it('rejects a result far from the anchor', () => {
        const far = { ...base, location: { type: 'Point', coordinates: [35.22, 31.78] } }
        assert.equal(isGoogleResultValid(far, { ...parts, anchor: [BEITAR_STREET_LNG, BEITAR_STREET_LAT] }), false)
    })

    it('rejects a city-level match when there is no anchor', () => {
        const cityLevel = { ...base, accuracy: 'APPROXIMATE' }
        assert.equal(isGoogleResultValid(cityLevel, parts), false)
    })
})
