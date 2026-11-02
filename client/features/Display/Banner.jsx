import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import Image from '#common/components/Image'
import Button from '#common/components/Button'
import Flex from '#common/components/Flex'
import { useText } from '#common/texts/TextProvider'
import { getDisplayImageUrl } from '#common/functions/displayImageUrl'
import { BREAKPOINTS, BANNER_WIDTHS, parseRatio, resolveSlideImage } from '#common/functions/displayImageBreakpoints'
import styles from './display.module.css'

export default function Banner({ block }) {
    const { layout, autoplaySec, ratio, slides = [] } = block.banner || {}
    if (!slides.length) return null
    // Blocks created before ratios existed have none: render each image at its
    // natural size instead of guessing one.
    const ratioStyle = { '--banner-ratio': parseRatio(ratio)?.join(' / ') || 'auto' }
    if (layout === 'mosaic') return <Mosaic slides={slides} ratioStyle={ratioStyle} />
    return <SlideCarousel slides={slides} autoplaySec={autoplaySec} ratioStyle={ratioStyle} />
}

function SlideLink({ slide, children, className }) {
    const external = /^https?:\/\//.test(slide.link)
    if (!slide.link) return <div className={className}>{children}</div>
    // New tab only when the slide asks for it. An absolute URL to our own site is a
    // full page load; an internal path stays an in-app route.
    if (external) {
        return <div className={className}>
            <a href={slide.link} target={slide.newTab ? '_blank' : undefined} rel={slide.newTab ? 'noreferrer' : undefined}>{children}</a>
        </div>
    }
    return <Link to={slide.link} className={className}>{children}</Link>
}

// Width-descriptor ladder mirroring BANNER_SIZES (s:800, m:1200, l:1600, xl:1920).
// The browser picks the smallest file >= viewport x DPR, so large screens get xl/l
// while phones get s/m — and only one file downloads.
function srcSetFor(basePath) {
    return ['s', 'm', 'l', 'xl']
        .map(size => `${getDisplayImageUrl(basePath, size)} ${BANNER_WIDTHS[size]}w`)
        .join(', ')
}

// <picture> art-direction switch: mobile, then tablet, then desktop. Sources are
// tried in order, so each one only needs an upper bound, and every ladder resolves
// through the same fallback rule as the admin preview (a missing size uses the next).
function SlideImage({ slide, sizes = '100vw' }) {
    const desktop = resolveSlideImage(slide, 'desktop')
    if (!desktop) return null
    return <picture className={styles.slideImg}>
        <source media={`(max-width: ${BREAKPOINTS.mobile}px)`} srcSet={srcSetFor(resolveSlideImage(slide, 'mobile'))} sizes={sizes} />
        <source media={`(max-width: ${BREAKPOINTS.tablet}px)`} srcSet={srcSetFor(resolveSlideImage(slide, 'tablet'))} sizes={sizes} />
        <Image
            src={getDisplayImageUrl(desktop, 'xl')}
            srcSet={srcSetFor(desktop)}
            sizes={sizes}
            alt={slide.alt || ''}
            className={styles.slideImg}
        />
    </picture>
}

function Mosaic({ slides, ratioStyle }) {
    return <div className={styles.mosaic} style={ratioStyle}>
        {slides.map((slide, i) => (
            <SlideLink key={i} slide={slide} className={styles.mosaicItem}>
                <SlideImage slide={slide} sizes="(max-width: 700px) 100vw, 50vw" />
            </SlideLink>
        ))}
    </div>
}

function SlideCarousel({ slides, autoplaySec, ratioStyle }) {
    const { TR } = useText()
    // Infinite in BOTH directions via clones on both ends:
    //   [cloneLast, slide0..slideN-1, cloneFirst]
    // Physical pos 0 = cloneLast, 1..count = real slides, count+1 = cloneFirst.
    // Stepping onto a clone animates one slide, then snaps (no transition)
    // to the matching real slide — so movement is always a single step,
    // never a long rewind across the whole track.
    const [pos, setPos] = useState(1)
    const [anim, setAnim] = useState(true)
    const [paused, setPaused] = useState(false)
    const count = slides.length
    const posRef = useRef(1)

    useEffect(() => {
        posRef.current = 1
        setPos(1)
        setAnim(true)
    }, [count])

    const logical = ((pos - 1) % count + count) % count

    function goTo(i) {
        posRef.current = ((i % count) + count) % count + 1
        setAnim(true)
        setPos(posRef.current)
    }

    function goNext() {
        // Already sitting on the trailing clone — wait for the snap.
        if (posRef.current >= count + 1) return
        posRef.current = posRef.current + 1
        setAnim(true)
        setPos(posRef.current)
    }

    function goPrev() {
        // Already sitting on the leading clone — wait for the snap.
        if (posRef.current <= 0) return
        posRef.current = posRef.current - 1
        setAnim(true)
        setPos(posRef.current)
    }

    function handleTransitionEnd() {
        if (posRef.current === count + 1) {
            posRef.current = 1
            setAnim(false)
            setPos(1)
        } else if (posRef.current === 0) {
            posRef.current = count
            setAnim(false)
            setPos(count)
        }
    }

    useEffect(() => {
        const sec = Number(autoplaySec)
        if (!sec || sec <= 0 || count < 2 || paused) return
        const timer = setInterval(() => {
            if (!document.hidden) goNext()
        }, sec * 1000)
        return () => clearInterval(timer)
    }, [autoplaySec, count, paused])

    if (count === 1) {
        return <div className={styles.hero} style={ratioStyle}>
            <SlideLink slide={slides[0]} className={styles.heroSlide}>
                <SlideImage slide={slides[0]} />
            </SlideLink>
        </div>
    }

    return <div
        className={styles.hero}
        style={ratioStyle}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
    >
        <div
            className={styles.heroTrack}
            style={{
                transform: `translateX(${(isRtl() ? 1 : -1) * pos * 100}%)`,
                transition: anim ? undefined : 'none'
            }}
            onTransitionEnd={handleTransitionEnd}
        >
            <SlideLink key="clone-last" slide={slides[count - 1]} className={styles.heroSlide} aria-hidden="true">
                <SlideImage slide={slides[count - 1]} />
            </SlideLink>
            {slides.map((slide, i) => (
                <SlideLink key={i} slide={slide} className={styles.heroSlide}>
                    <SlideImage slide={slide} />
                </SlideLink>
            ))}
            <SlideLink key="clone-first" slide={slides[0]} className={styles.heroSlide} aria-hidden="true">
                <SlideImage slide={slides[0]} />
            </SlideLink>
        </div>
        <Flex className={styles.heroNav}>
            <Button
                icon="right"
                mode="text"
                onClick={goPrev}
                aria-label={TR('display_prev_slide')}
                style={arrowBg}
            />
            <Flex className={styles.dots} gap={6}>
                {slides.map((_, i) => (
                    <button
                        key={i}
                        className={`${styles.dot} ${logical === i ? styles.dotActive : ''}`}
                        onClick={() => goTo(i)}
                        aria-label={`${TR('display_slide')} ${i + 1}`}
                    />
                ))}
            </Flex>
            <Button
                icon="left"
                mode="text"
                onClick={goNext}
                aria-label={TR('display_next_slide')}
                style={arrowBg}
            />
        </Flex>
    </div>
}

// In RTL the flex row lays slides right-to-left, so advancing means shifting
// the track right (positive X); mirrored in LTR. Read live (not hardcoded)
// so it survives a direction change.
function isRtl() {
    if (typeof document === 'undefined') return true
    return (document.documentElement?.dir || 'rtl') !== 'ltr'
}

// Translucent backdrop so arrows stay visible over any banner image.
const arrowBg = {
    background: 'rgba(0, 0, 0, 0.45)',
    color: '#fff',
    borderRadius: '50%',
    width: 36,
    height: 36
}
