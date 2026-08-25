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
            scrollContainerRef.current?.style.removeProperty('scroll-behavior')
        }
    }, [])

    const startHoverScroll = useCallback((direction) => {
        stopHoverScroll()
        const el = scrollContainerRef.current
        if (!el) return

        el.style.scrollBehavior = 'auto'

        const maxSpeed = direction === 'left' ? -450 : 450
        const rampDuration = 0.35
        const isRtl = getComputedStyle(el).direction === 'rtl'
        let elapsed = 0
        let lastTime = performance.now()

        const step = (currentTime) => {
            const container = scrollContainerRef.current
            if (!container) return

            const delta = Math.min((currentTime - lastTime) / 1000, 0.05)
            lastTime = currentTime
            elapsed += delta

            const ramp = Math.min(elapsed / rampDuration, 1)
            const speed = maxSpeed * (0.2 + 0.8 * ramp * ramp)

            const maxScrollable = container.scrollWidth - container.clientWidth
            const absScroll = Math.abs(container.scrollLeft)
            const headingToStart = speed < 0 !== isRtl
            const atLimit = maxScrollable <= 0 ||
                (headingToStart ? absScroll < 0.5 : maxScrollable - absScroll < 0.5)

            if (atLimit) {
                stopHoverScroll()
                return
            }

            container.scrollLeft += speed * delta
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

    const scrollToActive = useCallback(() => {
        const el = scrollContainerRef.current
        const active = el?.querySelector('[data-active]')
        active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    }, [])

    useEffect(() => {
        const el = scrollContainerRef.current
        if (!el || typeof MutationObserver === 'undefined') return

        let rafId

        const scheduleScroll = () => {
            cancelAnimationFrame(rafId)
            rafId = requestAnimationFrame(scrollToActive)
        }

        const observer = new MutationObserver(scheduleScroll)
        observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-active'] })

        const initialRafId = requestAnimationFrame(() => requestAnimationFrame(scrollToActive))

        return () => {
            observer.disconnect()
            cancelAnimationFrame(rafId)
            cancelAnimationFrame(initialRafId)
        }
    }, [contentList, scrollToActive])

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