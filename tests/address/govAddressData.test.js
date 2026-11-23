import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
    buildAliasRecord,
    buildCityDoc,
    buildOfficialStreetDoc,
    cityOf,
    isOfficial,
    officialCodeOf,
    synonymCodeOf
} from '../../server/scripts/govAddressData.js'

describe('gov address data', () => {
    it('reads both city column names and trims values', () => {
        assert.equal(cityOf({ city_name: '  ביתר עילית ' }), 'ביתר עילית')
        assert.equal(cityOf({ city_name_he: 'חולון' }), 'חולון')
        assert.equal(cityOf({}), '')
    })

    it('parses synonym status and resolves the official code', () => {
        const synonym = { street_name: 'בן זכאי', street_name_status: 'synonym of 123', official_code: 123 }
        const official = { street_name: 'יוחנן בן זכאי', street_name_status: 'official', street_code: '123', official_code: 123 }

        assert.equal(synonymCodeOf(synonym), '123')
        assert.equal(synonymCodeOf(official), null)
        assert.equal(isOfficial(synonym), false)
        assert.equal(isOfficial(official), true)
        assert.equal(officialCodeOf(synonym), '123')
    })

    it('never builds an official doc from a synonym row', () => {
        const synonym = {
            city_name: 'ביתר עילית',
            street_name: 'בן זכאי',
            street_code: '9569',
            street_name_status: 'synonym of 123',
            official_code: 123
        }
        assert.equal(buildOfficialStreetDoc(synonym, new Set()), null)
    })

    it('dedupes city docs and official streets per page', () => {
        const seen = new Set()
        const rows = [
            { city_name: 'ביתר עילית', street_name: 'יוחנן בן זכאי', street_name_status: 'official', official_code: 123 },
            { city_name: 'ביתר עילית', street_name: 'יוחנן בן זכאי', street_name_status: 'official', official_code: 123 }
        ]
        const docs = rows.map(row => buildOfficialStreetDoc(row, seen)).filter(Boolean)
        assert.equal(docs.length, 1)
        assert.equal(docs[0].street, 'יוחנן בן זכאי')
        assert.deepEqual(docs[0].aliases, [])
        assert.equal(docs[0].fallback, false)

        assert.deepEqual(buildCityDoc({ city_name: 'A' }, seen), { city: 'A', street: '' })
        assert.equal(buildCityDoc({ city_name: 'A' }, seen), null)
    })

    it('dedupes alias rows per city+code+name', () => {
        const seen = new Set()
        const row = {
            city_name: 'ביתר עילית',
            street_name: 'בן זכאי',
            street_name_status: 'synonym of 123',
            official_code: 123
        }
        assert.ok(buildAliasRecord(row, seen))
        assert.equal(buildAliasRecord(row, seen), null)
    })
})
