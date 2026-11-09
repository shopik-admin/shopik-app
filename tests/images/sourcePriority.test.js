import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { outranks, isUploadMain, sourceLabel } from '#server/services/image/sourcePriority.js'

const COMAX = 'https://comax.example/pic.jpg'
const SCRAPE = 'scrape://osem/3528'
const GS1 = 'gs1://3528'
const UPLOAD = 'upload://3528'

// Every writer in the app (enqueue.js, imageWorker.js, scrapeProduct.js,
// gs1/enrich.js, gs1ProcessWorker.js) asks this one question.
describe('main image source priority', () => {
    it('an upload outranks every automatic source', () => {
        for (const candidate of [COMAX, SCRAPE, GS1, UPLOAD])
            assert.equal(outranks(UPLOAD, candidate), candidate !== UPLOAD, `upload vs ${candidate}`)
    })

    it('gs1 outranks scrape and comax', () => {
        assert.equal(outranks(GS1, SCRAPE), true)
        assert.equal(outranks(GS1, COMAX), true)
        assert.equal(outranks(GS1, GS1), false)
        assert.equal(outranks(GS1, UPLOAD), false)
    })

    it('scrape outranks comax', () => {
        assert.equal(outranks(SCRAPE, COMAX), true)
        assert.equal(outranks(SCRAPE, SCRAPE), false)
    })

    it('a comax main blocks nothing — it is the floor of the ladder', () => {
        for (const candidate of [COMAX, SCRAPE, GS1, UPLOAD])
            assert.equal(outranks(COMAX, candidate), false, `comax vs ${candidate}`)
    })

    it('no main at all means anything may be written', () => {
        for (const missing of [undefined, null, ''])
            assert.equal(outranks(missing, COMAX), false, String(missing))
    })

    it('only uploads are protected from the automatic writers', () => {
        assert.equal(isUploadMain(UPLOAD), true)
        for (const other of [GS1, SCRAPE, COMAX, undefined, null, ''])
            assert.equal(isUploadMain(other), false, String(other))
    })

    it('labels the source for the admin report', () => {
        assert.equal(sourceLabel(UPLOAD), 'upload')
        assert.equal(sourceLabel(GS1), 'gs1')
        assert.equal(sourceLabel(SCRAPE), 'scrape')
        assert.equal(sourceLabel(COMAX), 'comax')
        assert.equal(sourceLabel(undefined), 'comax')
    })
})
