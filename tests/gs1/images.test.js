import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { zipSync } from 'fflate'
import { pickImageEntries } from '../../server/services/gs1/images.js'

const still = (filename, extra = {}) => ({ filename, image_type: 'S', id: filename, ...extra })

const makeZip = files => Buffer.from(zipSync(Object.fromEntries(
    Object.entries(files).map(([name, bytes]) => [name, new Uint8Array(bytes)])
)))

describe('pickImageEntries', () => {
    it('picks the ranked main + alternates, not the largest file', () => {
        const zip = makeZip({
            'huge.jpg': Buffer.alloc(5000, 1),
            'main.jpg': Buffer.alloc(10, 2),
            'alt1.jpg': Buffer.alloc(10, 3)
        })

        const { main, alternates } = pickImageEntries(zip, [
            still('main.jpg', { default_image: '1' }),
            still('alt1.jpg'),
            still('unused.jpg')
        ])

        assert.equal(main.name, 'main.jpg')
        assert.equal(main.asset.filename, 'main.jpg')
        assert.equal(main.data.length, 10)
        assert.deepEqual(alternates.map(a => a.name), ['alt1.jpg'])
    })

    it('falls back to the largest still by zip metadata when nothing ranks', () => {
        const zip = makeZip({
            'a.jpg': Buffer.alloc(10, 1),
            'b.png': Buffer.alloc(300, 2),
            'spin.jpg': Buffer.alloc(900, 3)
        })

        const { main, alternates } = pickImageEntries(zip, [still('missing.jpg')])

        assert.equal(main.name, 'spin.jpg')
        assert.equal(main.data.length, 900)
        assert.equal(main.asset.filename, 'missing.jpg')
        assert.deepEqual(alternates, [])
    })

    it('returns the exact bytes of each picked entry', () => {
        const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 250, 0, 9])
        const zip = makeZip({ 'x.png': bytes, 'other.png': Buffer.alloc(100, 7) })

        const { main } = pickImageEntries(zip, [still('x.png')])

        assert.deepEqual([...main.data], [...bytes])
    })

    it('ignores non-image entries and rejects image-free zips', () => {
        assert.throws(
            () => pickImageEntries(makeZip({ 'readme.txt': Buffer.from('hi') }), []),
            /no images/
        )
    })
})
