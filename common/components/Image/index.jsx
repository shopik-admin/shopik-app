import classNames from '#common/functions/classNames.js'
import styles from './image.module.css'

export const IMAGE_WIDTHS = { s: 300, m: 500, l: 800, xl: 1000 }

export function buildSrcSet(sizesMap) {
    if (!sizesMap || typeof sizesMap !== 'object') return undefined
    const parts = Object.entries(sizesMap)
        .filter(([name, src]) => src && IMAGE_WIDTHS[name])
        .map(([name, src]) => `${src} ${IMAGE_WIDTHS[name]}w`)
    return parts.length > 1 ? parts.join(', ') : undefined
}

export default function Image({ className, size = 'auto', width = size, height = size, src, srcSet, sizes: sizesAttr, loading, fetchPriority, ...props }) {
    const hasSrc = Boolean(src)
    const Tag = hasSrc ? 'img' : 'div'
    return <Tag
        {...(hasSrc && { src })}
        className={classNames(className, styles.image)}
        style={{ width, height }}
        loading={loading ?? (Tag === 'img' ? 'lazy' : undefined)}
        {...(fetchPriority && { fetchPriority })}
        {...(srcSet && { srcSet })}
        {...(sizesAttr && { sizes: sizesAttr })}
        decoding='async'
        {...props}
    />
}
