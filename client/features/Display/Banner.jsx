import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import Image from '#common/components/Image'
import Button from '#common/components/Button'
import Flex from '#common/components/Flex'
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

function SlideImage({ slide }) {
    return <>
        {slide.mobileImage && (
            <Image
                src={getDisplayImageUrl(slide.mobileImage, 'm')}
                alt={slide.alt || ''}
                className={`${styles.slideImg} ${styles.mobileOnly}`}
            />
        )}
        <Image
            src={getDisplayImageUrl(slide.image, 'xl')}
            alt={slide.alt || ''}
            className={`${styles.slideImg} ${slide.mobileImage ? styles.desktopOnly : ''}`}
        />
    </>
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
    const [index, setIndex] = useState(0)
    const [paused, setPaused] = useState(false)
    const count = slides.length

    useEffect(() => { setIndex(0) }, [count])

    useEffect(() => {
        const sec = Number(autoplaySec)
        if (!sec || sec <= 0 || count < 2 || paused || document.hidden) return
        const timer = setInterval(() => setIndex(i => (i + 1) % count), sec * 1000)
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
            <Button icon="right" mode="text" onClick={() => setIndex((index - 1 + count) % count)} aria-label="previous" />
            <Flex className={styles.dots} gap={6}>
                {slides.map((_, i) => (
                    <button
                        key={i}
                        className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
                        onClick={() => setIndex(i)}
                        aria-label={`slide ${i + 1}`}
                    />
                ))}
            </Flex>
            <Button icon="left" mode="text" onClick={() => setIndex((index + 1) % count)} aria-label="next" />
        </Flex>
    </div>
}
