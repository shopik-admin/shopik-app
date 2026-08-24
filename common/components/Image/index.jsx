import classNames from '#common/functions/classNames.js'
import styles from './image.module.css'

export default function Image({ className, size = 'auto', width = size, height = size, src, loading, ...props }) {
    const hasSrc = Boolean(src)
    const Tag = hasSrc ? 'img' : 'div'
    return <Tag
        {...(hasSrc && { src })}
        className={classNames(className, styles.image)}
        style={{ width, height }}
        loading={loading ?? (Tag === 'img' ? 'lazy' : undefined)}
        decoding='async'
        {...props}
    />
}
