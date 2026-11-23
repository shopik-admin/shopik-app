import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
    houseNumberMatches,
    lookupGovmap,
    lookupGovmapText,
    parseShapePoint,
    pickAddressResult,
    resetGovmapState,
    searchGovmapLive,
    webMercatorToWgs84
} from '../../server/external/addressProvider/govmapApi.js'

const BEITAR_ADDRESS = 'POINT(3909284.970801354 3723246.7367266268)'
const BEITAR_STREET = 'POINT(3909156.8446921143 3723164.2740610833)'
const JERUSALEM = 'POINT(3919836.3303811895 3734484.2180486564)'

const realFetch = globalThis.fetch
const realUrl = process.env.GOVMAP_SEARCH_URL
const realTimeout = process.env.GOVMAP_TIMEOUT_MS

beforeEach(() => {
    process.env.GOVMAP_SEARCH_URL = 'https://govmap.test/search-service/autocomplete'
    process.env.GOVMAP_TIMEOUT_MS = '50'
    resetGovmapState()
})

afterEach(() => {
    globalThis.fetch = realFetch
    if (realUrl === undefined) delete process.env.GOVMAP_SEARCH_URL
    else process.env.GOVMAP_SEARCH_URL = realUrl
    if (realTimeout === undefined) delete process.env.GOVMAP_TIMEOUT_MS
    else process.env.GOVMAP_TIMEOUT_MS = realTimeout
})

function stubGovmap(handler) {
    const calls = []
    globalThis.fetch = async (url, options) => {
        const body = JSON.parse(options.body)
        calls.push(body)
        return {
            ok: true,
            json: async () => ({ results: handler(body) || [] })
        }
    }
    return calls
}

describe('govmap coordinates', () => {
    it('converts EPSG:3857 to WGS84', () => {
        const [lng, lat] = webMercatorToWgs84(3909284.970801354, 3723246.7367266268)
        assert.ok(Math.abs(lng - 35.1177) < 0.001)
        assert.ok(Math.abs(lat - 31.6943) < 0.001)
    })

    it('parses a WKT point and rejects malformed shapes', () => {
        assert.deepEqual(parseShapePoint(BEITAR_ADDRESS).length, 2)
        assert.equal(parseShapePoint('LINESTRING(1 2, 3 4)'), null)
        assert.equal(parseShapePoint('POINT(0 0)')[1], 0)
    })

    it('matches house numbers exactly, allowing a trailing letter', () => {
        assert.equal(houseNumberMatches('יוחנן בן זכאי 3 ביתר עילית', '3'), true)
        assert.equal(houseNumberMatches('יוחנן בן זכאי 3א ביתר עילית', '3'), true)
        assert.equal(houseNumberMatches('יוחנן בן זכאי 31 ביתר עילית', '3'), false)
        assert.equal(houseNumberMatches('יוחנן בן זכאי 3/1 ביתר עילית', '3'), true)
        assert.equal(houseNumberMatches('רבנו תם 30 בני ברק', '3'), false)
    })
})

describe('govmap address picking', () => {
    it('rejects a same-named street in another city', () => {
        const results = [
            { type: 'address', text: 'ירושלים 100 תל אביב-יפו', shape: JERUSALEM },
            { type: 'address', text: 'יפו 100 ירושלים', shape: JERUSALEM }
        ]
        const match = pickAddressResult(results, { city: 'ירושלים', street: 'יפו', building: '100' })
        assert.equal(match.result.text, 'יפו 100 ירושלים')
    })

    it('accepts a single alias result whose street text is the official name', () => {
        const results = [
            { type: 'address', text: 'יוחנן בן זכאי 3 ביתר עילית', shape: BEITAR_ADDRESS }
        ]
        const match = pickAddressResult(results, { city: 'ביתר עילית', street: 'בן זכאי', building: '3' })
        assert.ok(match)
    })

    it('does not guess when two different streets share the number', () => {
        const results = [
            { type: 'address', text: 'רחוב א 3 ביתר עילית', shape: BEITAR_ADDRESS },
            { type: 'address', text: 'רחוב ב 3 ביתר עילית', shape: BEITAR_STREET }
        ]
        const match = pickAddressResult(results, { city: 'ביתר עילית', street: 'בן זכאי', building: '3' })
        assert.equal(match, null)
    })
})

describe('lookupGovmap', () => {
    it('returns an exact house point from one search', async () => {
        const calls = stubGovmap(body => {
            if (body.searchText === 'יוחנן בן זכאי 3 ביתר עילית')
                return [{ type: 'address', text: 'יוחנן בן זכאי 3 ביתר עילית', shape: BEITAR_ADDRESS }]
            return []
        })

        const result = await lookupGovmap({ city: 'ביתר עילית', street: 'יוחנן בן זכאי', building: '3' })

        assert.equal(calls.length, 1)
        assert.equal(result.address.source, 'govmap')
        assert.equal(result.address.accuracy, 'ROOFTOP')
        assert.ok(Math.abs(result.address.location.coordinates[0] - 35.1177) < 0.001)
        assert.equal(result.streetPoint, null)
    })

    it('falls back to the street midpoint when the house does not exist', async () => {
        const calls = stubGovmap(body => {
            if (body.searchText === 'יוחנן בן זכאי 999 ביתר עילית') return []
            if (body.searchText === 'יוחנן בן זכאי ביתר עילית')
                return [{ type: 'street', text: 'יוחנן בן זכאי ביתר עילית', shape: BEITAR_STREET }]
            return []
        })

        const result = await lookupGovmap({ city: 'ביתר עילית', street: 'יוחנן בן זכאי', building: '999' })

        assert.equal(calls.length, 2)
        assert.equal(result.address, null)
        assert.ok(result.streetPoint)
    })

    it('skips the house search when no building was given', async () => {
        const calls = stubGovmap(body => {
            if (body.searchText === 'יוחנן בן זכאי ביתר עילית')
                return [{ type: 'street', text: 'יוחנן בן זכאי ביתר עילית', shape: BEITAR_STREET }]
            return []
        })

        const result = await lookupGovmap({ city: 'ביתר עילית', street: 'יוחנן בן זכאי' })

        assert.equal(calls.length, 1)
        assert.ok(result.streetPoint)
    })

    it('retries the base number when the building has a letter', async () => {
        const calls = stubGovmap(body => {
            if (body.searchText === 'יוחנן בן זכאי 3 ביתר עילית')
                return [{ type: 'address', text: 'יוחנן בן זכאי 3 ביתר עילית', shape: BEITAR_ADDRESS }]
            return []
        })

        const result = await lookupGovmap({ city: 'ביתר עילית', street: 'יוחנן בן זכאי', building: '3א' })

        assert.equal(calls.length, 2)
        assert.ok(result.address)
    })

    it('falls back to the city centroid when the street is unknown', async () => {
        const calls = stubGovmap(body => {
            if (body.searchText === 'ביתר עילית')
                return [{ type: 'settlement', text: 'ביתר עילית', shape: JERUSALEM }]
            return []
        })

        const result = await lookupGovmap({ city: 'ביתר עילית', street: 'לא קיים', building: '3' })

        assert.equal(calls.length, 3)
        assert.ok(result.cityPoint)
        assert.equal(result.streetPoint, null)
    })
})

describe('govmap failure handling', () => {
    it('returns [] instead of throwing when the service fails', async () => {
        globalThis.fetch = async () => ({ ok: false, status: 503 })
        assert.deepEqual(await searchGovmapLive({ searchText: 'בן זכאי 3 ביתר עילית' }), [])
    })

    it('returns null for free text with no address result', async () => {
        stubGovmap(() => [{ type: 'settlement', text: 'ביתר עילית', shape: JERUSALEM }])
        assert.equal(await lookupGovmapText('משהו לא קיים'), null)
    })

    it('returns the first address for free text', async () => {
        stubGovmap(() => [{
            type: 'address',
            text: 'הרוקמים 26 חולון',
            shape: 'POINT(3873979.2444560667 3764332.382156994)'
        }])
        const result = await lookupGovmapText('הרוקמים 26 חולון')
        assert.equal(result.source, 'govmap')
        assert.ok(result.location.coordinates.length === 2)
    })
})
