import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {
    ICON_DIR,
    deleteIcon,
    iconDir,
    isStoredIcon,
    toIconWebp
} from '#server/services/categoryIcon.js'

const create = (width, height, channels = 4, alpha = 1) =>
    sharp({ create: { width, height, channels, background: { r: 25, g: 88, b: 85, alpha } } })

describe('category icon upload', () => {
    it('re-encodes a png as a square webp', async () => {
        const webp = await toIconWebp(await create(512, 512).png().toBuffer())
        const meta = await sharp(webp).metadata()

        assert.equal(meta.format, 'webp')
        assert.equal(meta.width, 128)
        assert.equal(meta.height, 128)
    })

    it('keeps the aspect ratio and the alpha channel', async () => {
        const webp = await toIconWebp(await create(400, 200, 4, 0.5).png().toBuffer())
        const meta = await sharp(webp).metadata()

        assert.deepEqual([meta.width, meta.height], [128, 64])
        assert.equal(meta.hasAlpha, true)
    })

    it('accepts jpeg and webp sources', async () => {
        for (const data of [await create(200, 200, 3).jpeg().toBuffer(), await create(200, 200).webp().toBuffer()]) {
            const meta = await sharp(await toIconWebp(data)).metadata()
            assert.equal(meta.format, 'webp')
        }
    })

    it('rejects a vector source', async () => {
        const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200"/></svg>')
        await assert.rejects(async () => toIconWebp(svg), error => {
            assert.equal(error.status, 400)
            assert.match(error.message, /PNG, JPEG or WebP/)
            return true
        })
    })

    it('rejects an icon that is too small to stay sharp', async () => {
        await assert.rejects(async () => toIconWebp(await create(32, 32).png().toBuffer()), error => {
            assert.equal(error.status, 400)
            assert.match(error.message, /at least 64x64/)
            return true
        })
    })

    it('rejects an oversized source', async () => {
        await assert.rejects(async () => toIconWebp(await create(2048, 2048).png().toBuffer()), error => {
            assert.equal(error.status, 400)
            assert.match(error.message, /at most 1024x1024/)
            return true
        })
    })

    it('rejects garbage', async () => {
        await assert.rejects(async () => toIconWebp(Buffer.from('not an image at all')), error => {
            assert.equal(error.status, 400)
            return true
        })
    })

    it('keys the stored path by category id and keeps only our own prefix', () => {
        assert.equal(iconDir('nc:201:2001'), `${ICON_DIR}/nc-201-2001`)
        assert.equal(isStoredIcon(`${ICON_DIR}/nc-201/v1/icon.webp`), true)
        assert.equal(isStoredIcon('basket'), false)
        assert.equal(isStoredIcon(undefined), false)
    })

    it('ignores legacy icon names when deleting', async () => {
        // 'basket' is an icon name, not a bucket object — nothing is deleted.
        await deleteIcon('basket')
        await deleteIcon('')
    })
})
