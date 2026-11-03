import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isSiteLink, toInternalLink } from '../../common/functions/internalLink.js'

describe('banner links on the site itself', () => {
    it('keeps a path as typed', () => {
        assert.equal(toInternalLink('/sales', 'shefa.click'), '/sales')
    })

    it('stores a same-host link as the in-app path', () => {
        assert.equal(toInternalLink('https://shefa.click/sales', 'shefa.click'), '/sales')
    })

    it('counts the www variant as the same site', () => {
        assert.ok(isSiteLink('https://www.shefa.click/sales', 'shefa.click'))
        assert.equal(toInternalLink('https://www.shefa.click/sales', 'shefa.click'), '/sales')
    })

    it('does not count the admin subdomain — banners navigate shoppers', () => {
        assert.ok(!isSiteLink('https://admin.shefa.click/orders', 'shefa.click'))
        assert.equal(toInternalLink('https://admin.shefa.click/orders', 'shefa.click'), 'https://admin.shefa.click/orders')
    })

    it('keeps a link to another site', () => {
        assert.ok(!isSiteLink('https://example.com/sales', 'shefa.click'))
        assert.equal(toInternalLink('https://example.com/sales', 'shefa.click'), 'https://example.com/sales')
    })

    it('preserves query and hash', () => {
        assert.equal(toInternalLink('https://shefa.click/sales?utm=x#top', 'shefa.click'), '/sales?utm=x#top')
        assert.equal(toInternalLink('https://shefa.click/', 'shefa.click'), '/')
    })

    it('a slide that wants a new tab keeps its full url', () => {
        assert.equal(toInternalLink('https://shefa.click/sales', 'shefa.click', true), 'https://shefa.click/sales')
        // Another site is never the site itself, tab or not.
        assert.equal(toInternalLink('https://shopik.co.il/sales', 'shefa.click', true), 'https://shopik.co.il/sales')
    })

    it('without a domain url nothing can be recognised as the site itself', () => {
        assert.equal(toInternalLink('https://shefa.click/sales', ''), 'https://shefa.click/sales')
    })

    it('leaves something that is not a url as typed', () => {
        assert.equal(toInternalLink('shefa.click/sales', 'shefa.click'), 'shefa.click/sales')
        assert.equal(toInternalLink('', 'shefa.click'), '')
    })
})
