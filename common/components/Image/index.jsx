import classNames from '#common/functions/classNames.js'
import styles from './image.module.css'

export default function Image({ className, size = 'auto', width = size, height = size, src, ...props }) {
    const Tag = src ? 'img' : 'div'
    return <Tag src={src} className={classNames(className, styles.image)} style={{ width, height }} {...props} />
}
