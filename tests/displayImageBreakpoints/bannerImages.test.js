import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
    BREAKPOINTS, SIZES, SIZE_FIELD,
    parseRatio, matchesRatio, resolveSlideImage, slideImageField, targetDimensions
} from '../../common/functions/displayImageBreakpoints.js'

describe('banner size fallback', () => {
    it('uses each size own image when present', () => {
        const slide = { image: 'd', tabletImage: 't', mobileImage: 'm' }
        assert.equal(resolveSlideImage(slide, 'desktop'), 'd')
        assert.equal(resolveSlideImage(slide, 'tablet'), 't')
        assert.equal(resolveSlideImage(slide, 'mobile'), 'm')
    })

    it('a missing tablet shows the mobile image', () => {
        const slide = { image: 'd', mobileImage: 'm' }
        assert.equal(resolveSlideImage(slide, 'tablet'), 'm')
        assert.equal(slideImageField(slide, 'tablet'), SIZE_FIELD.mobile)
    })

    it('a size with nothing below it falls back to the desktop image', () => {
        const slide = { image: 'd' }
        assert.equal(resolveSlideImage(slide, 'mobile'), 'd')
        assert.equal(resolveSlideImage(slide, 'tablet'), 'd')
    })

    it('a tablet-only slide uses it for the other sizes', () => {
        const slide = { tabletImage: 't' }
        assert.equal(resolveSlideImage(slide, 'mobile'), 't')
        assert.equal(resolveSlideImage(slide, 'desktop'), 't')
    })

    it('an empty slide resolves to nothing', () => {
        assert.equal(resolveSlideImage({}, 'tablet'), '')
        assert.equal(slideImageField(undefined, 'desktop'), '')
    })

    it('keeps the mobile band below the tablet band', () => {
        assert.ok(BREAKPOINTS.mobile < BREAKPOINTS.tablet)
        assert.deepEqual(SIZES, ['desktop', 'tablet', 'mobile'])
    })
})

describe('banner upload targets', () => {
    it('derives each size dimensions from the block ratio', () => {
        assert.deepEqual(targetDimensions('16:10', 'desktop'), { width: 1600, height: 1000 })
        assert.deepEqual(targetDimensions('16:10', 'tablet'), { width: 1200, height: 750 })
        assert.deepEqual(targetDimensions('16:10', 'mobile'), { width: 800, height: 500 })
        assert.deepEqual(targetDimensions('1:1', 'tablet'), { width: 1200, height: 1200 })
    })

    it('accepts a near ratio and rejects a real mismatch', () => {
        assert.ok(matchesRatio(1600, 1000, '16:10'))
        assert.ok(matchesRatio(1601, 1000, '16:10'))
        assert.ok(!matchesRatio(1200, 800, '16:10'))
    })

    it('blocks without a ratio match nothing rather than guessing one', () => {
        assert.equal(parseRatio(''), null)
        assert.equal(parseRatio('16:'), null)
        assert.equal(targetDimensions('', 'mobile'), null)
        assert.ok(!matchesRatio(1200, 800, ''))
    })
})
