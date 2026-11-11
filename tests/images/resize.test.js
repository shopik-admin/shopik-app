import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { crc32, deflateSync } from 'node:zlib'
import sharp from 'sharp'
import resize from '../../server/services/image/resize.js'

function pngChunk(type, data) {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const typeBytes = Buffer.from(type, 'ascii')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
    return Buffer.concat([length, typeBytes, data, crc])
}

// Header-only PNG that declares a huge canvas without carrying the pixels.
function pngWithSize(width, height) {
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(width, 0)
    ihdr.writeUInt32BE(height, 4)
    ihdr[8] = 8 // bit depth
    ihdr[9] = 2 // truecolour
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', deflateSync(Buffer.alloc(16))),
        pngChunk('IEND', Buffer.alloc(0))
    ])
}

describe('resize', () => {
    it('produces the requested webp size', async () => {
        const input = await sharp({
            create: { width: 1200, height: 900, channels: 3, background: '#336699' }
        }).png().toBuffer()

        const { l } = await resize(input, { l: 600 })
        const meta = await sharp(l).metadata()

        assert.equal(meta.format, 'webp')
        assert.equal(meta.width, 600)
        assert.equal(meta.height, 450)
    })

    it('refuses images above the pixel cap', async () => {
        await assert.rejects(
            () => resize(pngWithSize(10000, 6000)),
            /pixel limit|exceeds/i
        )
    })
})
