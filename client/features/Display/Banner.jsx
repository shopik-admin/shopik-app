import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import Image from '#common/components/Image'
import Button from '#common/components/Button'
import Flex from '#common/components/Flex'
import { useText } from '#common/texts/TextProvider'
import { getDisplayImageUrl } from '#common/functions/displayImageUrl'
import styles from './display.module.css'

export default function Banner({ block }) {
    const { layout, autoplaySec, slides = [] } = block.banner || {}
    if (!slides.length) return null
    if (layout === 'mosaic') return <Mosaic slides={slides} />
    return <SlideCarousel slides={slides} autoplaySec={autoplaySec} />
}

function SlideLink({ slide, children, className }) {
    if (!slide.link) return <div className={className}>{children}</div>
    if (/^https?:\/\//.test(slide.link)) {
        return <div className={className}><a href={slide.link} target="_blank" rel="noreferrer">{children}</a></div>
    }
    return <Link to={slide.link} className={className}>{children}</Link>
}

// <picture> loads exactly one variant (mobile OR desktop) — unlike the
// previous dual-<img> version, the hidden variant never downloads.
function SlideImage({ slide }) {
    const desktop = slide.image ? getDisplayImageUrl(slide.image, 'xl') : ''
    const mobile = slide.mobileImage ? getDisplayImageUrl(slide.mobileImage, 'm') : ''
    if (!desktop && !mobile) return null
    if (!desktop || !mobile) {
        return <Image
            src={desktop || mobile}
            alt={slide.alt || ''}
            className={styles.slideImg}
        />
    }
    return <picture className={styles.slideImg}>
        <source media="(max-width: 700px)" srcSet={mobile} />
        <Image
            src={desktop}
            alt={slide.alt || ''}
            className={styles.slideImg}
        />
    </picture>
}

function Mosaic({ slides }) {
    return <div className={styles.mosaic}>
        {slides.map((slide, i) => (
            <SlideLink key={i} slide={slide} className={styles.mosaicItem}>
                <SlideImage slide={slide} />
            </SlideLink>
        ))}
    </div>
}

function SlideCarousel({ slides, autoplaySec }) {
    const { TR } = useText()
    const [pos, setPos] = useState(0)
    const [anim, setAnim] = useState(true)
    const [paused, setPaused] = useState(false)
    const count = slides.length
    const posRef = useRef(0)

    useEffect(() => {
        posRef.current = 0
        setPos(0)
        setAnim(true)
    }, [count])

    function goTo(i) {
        posRef.current = ((i % count) + count) % count
        setAnim(true)
        setPos(posRef.current)
    }

    // Forward is infinite: position `count` shows a clone of slide 0, then
    // snaps back to 0 with the transition off (see onTransitionEnd).
    function goNext() {
        posRef.current = posRef.current >= count ? 1 : posRef.current + 1
        setAnim(true)
        setPos(posRef.current)
    }

    function goPrev() {
        posRef.current = (posRef.current - 1 + count) % count
        setAnim(true)
        setPos(posRef.current)
    }

    function handleTransitionEnd() {
        if (posRef.current === count) {
            posRef.current = 0
            setAnim(false)
            setPos(0)
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
        return <div className={styles.hero}>
            <SlideLink slide={slides[0]} className={styles.heroSlide}>
                <SlideImage slide={slides[0]} />
            </SlideLink>
        </div>
    }

    return <div
        className={styles.hero}
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
            {slides.map((slide, i) => (
                <SlideLink key={i} slide={slide} className={styles.heroSlide}>
                    <SlideImage slide={slide} />
                </SlideLink>
            ))}
            <SlideLink key="clone" slide={slides[0]} className={styles.heroSlide} aria-hidden="true">
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
                        className={`${styles.dot} ${pos % count === i ? styles.dotActive : ''}`}
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
