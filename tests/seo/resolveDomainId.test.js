import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import resolveDomainId, { clearDomainCache } from '../../server/utils/resolveDomainId.js'

const DOMAINS = [
    { id: 'd1', url: 'shopik.co.il', isDefault: true },
    { id: 'd2', url: 'store-b.com', isDefault: false }
]
const DL = {
    Domain: {
        async readOne(filter) {
            if (filter.url) return DOMAINS.find(d => d.url === filter.url) || null
            if (filter.isDefault) return DOMAINS.find(d => d.isDefault) || null
            return null
        }
    }
}

describe('resolveDomainId host fallback', () => {
    beforeEach(() => clearDomainCache())

    it('resolves browser traffic from Origin', async () => {
        assert.equal(await resolveDomainId({ headers: { origin: 'https://store-b.com', host: 'shopik.co.il' } }, DL), 'd2')
    })

    it('resolves bot traffic (no Origin/Referer) from the Host header', async () => {
        assert.equal(await resolveDomainId({ headers: { host: 'store-b.com' } }, DL), 'd2')
    })

    it('strips www/admin prefixes and ports from the host', async () => {
        assert.equal(await resolveDomainId({ headers: { host: 'www.store-b.com' } }, DL), 'd2')
        assert.equal(await resolveDomainId({ headers: { host: 'store-b.com:443' } }, DL), 'd2')
    })

    it('falls back to the default domain for unknown or invalid hosts', async () => {
        assert.equal(await resolveDomainId({ headers: { host: 'unknown.com' } }, DL), 'd1')
        assert.equal(await resolveDomainId({ headers: { host: 'localhost' } }, DL), 'd1')
        assert.equal(await resolveDomainId({ headers: {} }, DL), 'd1')
    })

    it('throws when neither the host nor a default domain resolves', async () => {
        await assert.rejects(
            () => resolveDomainId({ headers: { host: 'unknown.com' } }, { Domain: { readOne: async () => null } }),
            { status: 500, message: 'no default domain configured' }
        )
    })
})
