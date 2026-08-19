import styles from './image.module.css'

export default function Image({ size = 'auto', width = size, height = size, src, ...props }) {
    const Tag = src ? 'img' : 'div'
    return <Tag src={src} className={styles.image} style={{ width, height }} {...props} />
}
