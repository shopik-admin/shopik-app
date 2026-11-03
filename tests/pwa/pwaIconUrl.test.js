import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getPwaIconUrl, PWA_ICON_FILES } from '../../common/functions/pwaIconUrl.js'

const BASE = 'https://files.shopik.co.il'

describe('getPwaIconUrl', () => {
    it('returns an empty string when no icon is configured', () => {
        assert.equal(getPwaIconUrl(''), '')
        assert.equal(getPwaIconUrl(null), '')
        assert.equal(getPwaIconUrl(undefined), '')
        assert.equal(getPwaIconUrl('   '), '')
    })

    it('appends the requested PNG variant to a storage dir', () => {
        assert.equal(
            getPwaIconUrl('images/settings/d1/appIcon/v1', PWA_ICON_FILES.icon192),
            `${BASE}/images/settings/d1/appIcon/v1/192.png`
        )
        assert.equal(
            getPwaIconUrl('/images/settings/d1/appIcon/v1/', PWA_ICON_FILES.maskable512),
            `${BASE}/images/settings/d1/appIcon/v1/maskable-512.png`
        )
    })

    it('defaults to the 512 variant', () => {
        assert.equal(
            getPwaIconUrl('images/settings/d1/appIcon/v1'),
            `${BASE}/images/settings/d1/appIcon/v1/512.png`
        )
    })

    it('passes through absolute URLs and data URIs', () => {
        assert.equal(
            getPwaIconUrl('https://cdn.example.com/icon.png'),
            'https://cdn.example.com/icon.png'
        )
        assert.equal(getPwaIconUrl('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA')
    })

    it('passes through raw file values', () => {
        assert.equal(
            getPwaIconUrl('images/settings/d1/appIcon/icon.png', PWA_ICON_FILES.icon192),
            `${BASE}/images/settings/d1/appIcon/icon.png`
        )
    })
})
