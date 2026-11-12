import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getProductImageUrl, getProductImageUrls, mainImageHash } from '../../common/functions/productImageUrl.js'

describe('product image URLs', () => {
    it('builds main and alternate paths from the product id', () => {
        const urls = getProductImageUrls('p1', [{ main: true }, { main: false }, { main: false }], 'm')

        assert.equal(urls.length, 3)
        assert.ok(urls[0].endsWith('/images/products/p1/m.webp'))
        assert.ok(urls[1].endsWith('/images/products/p1/alt-1/m.webp'))
        assert.ok(urls[2].endsWith('/images/products/p1/alt-2/m.webp'))
    })

    it('supports a keyed size directly', () => {
        assert.ok(getProductImageUrl('p1', 'xl', 'alt-1').endsWith('/images/products/p1/alt-1/xl.webp'))
    })

    it('returns no URLs when the product has no images', () => {
        assert.deepEqual(getProductImageUrls('p1', [], 'm'), [])
    })

    // The bucket serves these files with Cache-Control: immutable, so the URL
    // alone decides what a browser keeps.
    it('carries the image hash so a replaced picture is a new URL', () => {
        const before = getProductImageUrls('p1', [{ main: true, hash: 'aaa111' }], 's')[0]
        const after = getProductImageUrls('p1', [{ main: true, hash: 'bbb222' }], 's')[0]

        assert.ok(before.endsWith('/images/products/p1/s.webp?v=aaa111'))
        assert.notEqual(before, after)
    })

    it('keeps the exact same URL while the picture is unchanged', () => {
        const url = () => getProductImageUrls('p1', [{ main: true, hash: 'aaa111' }], 's')[0]

        // Same hash twice must be byte-identical, or the cache never hits.
        assert.equal(url(), url())
    })

    it('falls back to the bare URL for legacy entries without a hash', () => {
        assert.ok(getProductImageUrls('p1', [{ main: true, sizes: { s: 'x' } }], 's')[0].endsWith('/s.webp'))
    })

    it('versions alternate entries too', () => {
        const urls = getProductImageUrls('p1', [
            { main: true, hash: 'm1' },
            { main: false, hash: 'm1' }
        ], 'm')

        assert.ok(urls[1].endsWith('/alt-1/m.webp?v=m1'))
    })

    it('takes the version from the main entry only', () => {
        assert.equal(mainImageHash({ images: { product: [{ main: false, hash: 'alt' }, { main: true, hash: 'main' }] } }), 'main')
        assert.equal(mainImageHash({}), '')
    })

    it('never lets a hash smuggle a query or a path', () => {
        assert.ok(
            getProductImageUrl('p1', 's', '', 'aa?x=1/../../etc')
                .endsWith('/images/products/p1/s.webp?v=aax1etc')
        )
    })
})
