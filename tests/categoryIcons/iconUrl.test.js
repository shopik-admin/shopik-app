import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { categoryIconUrl, isCategoryIconFile } from '#common/functions/categoryIconUrl.js'

process.env.FILES_BASE_URL = 'https://files.example.test'

describe('category icon url', () => {
    it('treats a stored icon path as a file', () => {
        const stored = 'images/categories/nc-201/v1/icon.webp'
        assert.equal(isCategoryIconFile(stored), true)
        assert.equal(categoryIconUrl(stored), `https://files.example.test/${stored}`)
    })

    it('passes absolute urls through', () => {
        assert.equal(categoryIconUrl('https://cdn.example.test/x.webp'), 'https://cdn.example.test/x.webp')
    })

    it('leaves legacy icon names to the Icon component', () => {
        for (const name of ['basket', 'cigarette', '', null, undefined]) {
            assert.equal(isCategoryIconFile(name), false, String(name))
            assert.equal(categoryIconUrl(name), '')
        }
    })
})
