import { useState, useEffect, useRef } from 'react'
import classNames from '#common/functions/classNames.js'
import styles from './image.module.css'
import Icon from 'common/components/Icon'

export default function Image({ className, size = 'auto', width = size, height = size, src, loading, style: styleProp, onError, ...props }) {
    const [failed, setFailed] = useState(false)
    const imgRef = useRef(null)
    useEffect(() => { setFailed(false) }, [src])
    // handle cached broken images where onError doesn't fire synchronously
    useEffect(() => {
        if (failed || !src) return
        const t = setTimeout(() => {
            const img = imgRef.current
            if (img && img.complete && (img.naturalWidth === 0 || img.naturalHeight === 0)) {
                setFailed(true)
            }
        }, 50)
        return () => clearTimeout(t)
    }, [src, failed])
    const hasSrc = Boolean(src) && !failed
    const isValidCssSize = (v) => {
        if (v == null || v === 'auto') return false
        const s = String(v)
        if (['s', 'm', 'l', 'xl', 'xxl', 'xs'].includes(s)) return false
        return true
    }
    const mergedStyle = { ...(isValidCssSize(width) ? { width } : {}), ...(isValidCssSize(height) ? { height } : {}), ...(styleProp || {}) }

    if (!hasSrc) {
        return (
            <div
                className={classNames(className, styles.image, styles.fallback)}
                style={mergedStyle}
                aria-hidden="true"
                {...props}
            >
                <Icon name="image" size={32} style={{ opacity: 0.35 }} />
            </div>
        )
    }

    return (
        <img
            ref={imgRef}
            src={src}
            className={classNames(className, styles.image)}
            style={mergedStyle}
            loading={loading ?? 'lazy'}
            decoding="async"
            onError={(e) => {
                setFailed(true)
                onError?.(e)
            }}
            {...props}
        />
    )
}
