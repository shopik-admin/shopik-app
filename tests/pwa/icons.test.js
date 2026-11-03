import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const ICONS = [
    { file: 'icon-192.png', size: 192 },
    { file: 'icon-512.png', size: 512 },
    { file: 'maskable-512.png', size: 512 },
    { file: 'apple-180.png', size: 180 }
]

describe('default PWA icons', () => {
    for (const app of ['client', 'admin']) {
        for (const { file, size } of ICONS) {
            it(`${app}/public/icons/${file} is a ${size}x${size} PNG`, async () => {
                const metadata = await sharp(path.join(ROOT, app, 'public', 'icons', file)).metadata()
                assert.equal(metadata.format, 'png')
                assert.equal(metadata.width, size)
                assert.equal(metadata.height, size)
            })
        }
    }
})
