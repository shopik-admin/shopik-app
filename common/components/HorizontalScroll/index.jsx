import React, { useRef, useState, useEffect, useCallback } from 'react'
import classNames from 'common/functions/classNames'
import styles from './horizontalScroll.module.css'
import Button from '../Button'
import Flex from '../Flex'
import Text from '../Text'

export default function HorizontalScroll({ items = [], children = items, className = '' }) {
    const scrollContainerRef = useRef(null)
    const [showLeftArrow, setShowLeftArrow] = useState(false)
    const [showRightArrow, setShowRightArrow] = useState(false)

    const checkScrollPosition = useCallback(() => {
        const el = scrollContainerRef.current
        if (!el) return

        const { scrollLeft, scrollWidth, clientWidth } = el
        const maxScrollable = scrollWidth - clientWidth

        if (maxScrollable <= 0) {
            setShowLeftArrow(false)
            setShowRightArrow(false)
            return
        }

        const isRtl = getComputedStyle(el).direction === 'rtl'

        if (isRtl) {
            const absScroll = Math.abs(scrollLeft)
            setShowLeftArrow(absScroll < maxScrollable - 2)
            setShowRightArrow(absScroll > 2)
        } else {
            setShowLeftArrow(scrollLeft > 2)
            setShowRightArrow(scrollLeft < maxScrollable - 2)
        }
    }, [])

    const contentList = Array.isArray(children) && children.length > 0 ? children : (Array.isArray(items) ? items : [])

    useEffect(() => {
        const el = scrollContainerRef.current
        if (!el) return

        checkScrollPosition()

        const rafId = requestAnimationFrame(() => checkScrollPosition())
        const timerId = setTimeout(checkScrollPosition, 100)

        let resizeObserver
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => checkScrollPosition())
            resizeObserver.observe(el)
            Array.from(el.children).forEach(child => resizeObserver.observe(child))
        }

        el.addEventListener('scroll', checkScrollPosition)
        window.addEventListener('resize', checkScrollPosition)

        return () => {
            cancelAnimationFrame(rafId)
            clearTimeout(timerId)
            if (resizeObserver) resizeObserver.disconnect()
            el.removeEventListener('scroll', checkScrollPosition)
            window.removeEventListener('resize', checkScrollPosition)
        }
    }, [contentList, checkScrollPosition])

    const hoverScrollRef = useRef(null)

    const stopHoverScroll = useCallback(() => {
        if (hoverScrollRef.current) {
            cancelAnimationFrame(hoverScrollRef.current)
            hoverScrollRef.current = null
        }
    }, [])

    const startHoverScroll = useCallback((direction) => {
        stopHoverScroll()
        const el = scrollContainerRef.current
        if (!el) return

        const pixelsPerSecond = direction === 'left' ? -220 : 220
        let lastTime = performance.now()

        const step = (currentTime) => {
            const container = scrollContainerRef.current
            if (!container) return

            const delta = (currentTime - lastTime) / 1000
            lastTime = currentTime

            const safeDelta = Math.min(delta, 0.05)
            container.scrollLeft += pixelsPerSecond * safeDelta

            checkScrollPosition()
            hoverScrollRef.current = requestAnimationFrame(step)
        }

        hoverScrollRef.current = requestAnimationFrame(step)
    }, [stopHoverScroll, checkScrollPosition])

    useEffect(() => {
        return () => {
            stopHoverScroll()
        }
    }, [stopHoverScroll])

    const scroll = (direction) => {
        stopHoverScroll()
        const el = scrollContainerRef.current
        if (!el) return

        const scrollAmount = el.clientWidth * 0.75
        const multiplier = direction === 'left' ? -1 : 1

        el.scrollBy({
            left: multiplier * scrollAmount,
            behavior: 'smooth'
        })
    }

    return (
        <Flex className={classNames(styles.wrapper, className)} alignItems='center'>
            {showLeftArrow && (
                <Button
                    icon='left'
                    className={classNames(styles.arrow, styles.leftArrow)}
                    onClick={() => scroll('left')}
                    onMouseEnter={() => startHoverScroll('left')}
                    onMouseLeave={stopHoverScroll}
                    onTouchStart={() => startHoverScroll('left')}
                    onTouchEnd={stopHoverScroll}
                    aria-label='Scroll left'
                />
            )}

            <Flex
                ref={scrollContainerRef}
                className={styles.scrollContainer}
                gap={10}
            >
                {contentList.map((item, index) => (
                    <Flex key={index} className={styles.item} shrink={0}>
                        {typeof item === 'string' ? <Text>{item}</Text> : item}
                    </Flex>
                ))}
            </Flex>

            {showRightArrow && (
                <Button
                    icon='right'
                    className={classNames(styles.arrow, styles.rightArrow)}
                    onClick={() => scroll('right')}
                    onMouseEnter={() => startHoverScroll('right')}
                    onMouseLeave={stopHoverScroll}
                    onTouchStart={() => startHoverScroll('right')}
                    onTouchEnd={stopHoverScroll}
                    aria-label='Scroll right'
                />
            )}
        </Flex>
    )
}