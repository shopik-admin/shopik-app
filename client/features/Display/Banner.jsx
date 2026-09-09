import { useEffect, useState } from 'react'
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
    const [index, setIndex] = useState(0)
    const [paused, setPaused] = useState(false)
    const count = slides.length

    useEffect(() => { setIndex(0) }, [count])

    useEffect(() => {
        const sec = Number(autoplaySec)
        if (!sec || sec <= 0 || count < 2 || paused) return
        const timer = setInterval(() => {
            if (!document.hidden) setIndex(i => (i + 1) % count)
        }, sec * 1000)
        return () => clearInterval(timer)
    }, [autoplaySec, count, paused])

    if (count === 1) {
        return <SlideLink slide={slides[0]} className={styles.heroSlide}>
            <SlideImage slide={slides[0]} />
        </SlideLink>
    }

    return <div
        className={styles.hero}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
    >
        {slides.map((slide, i) => i === index && (
            <SlideLink key={i} slide={slide} className={`${styles.heroSlide} ${styles.fadeIn}`}>
                <SlideImage slide={slide} />
            </SlideLink>
        ))}
        <Flex className={styles.heroNav}>
            <Button
                icon="right"
                mode="text"
                onClick={() => setIndex((index - 1 + count) % count)}
                aria-label={TR('display_prev_slide')}
                style={arrowBg}
            />
            <Flex className={styles.dots} gap={6}>
                {slides.map((_, i) => (
                    <button
                        key={i}
                        className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
                        onClick={() => setIndex(i)}
                        aria-label={`${TR('display_slide')} ${i + 1}`}
                    />
                ))}
            </Flex>
            <Button
                icon="left"
                mode="text"
                onClick={() => setIndex((index + 1) % count)}
                aria-label={TR('display_next_slide')}
                style={arrowBg}
            />
        </Flex>
    </div>
}

// Translucent backdrop so arrows stay visible over any banner image.
const arrowBg = {
    background: 'rgba(0, 0, 0, 0.45)',
    color: '#fff',
    borderRadius: '50%',
    width: 36,
    height: 36
}
