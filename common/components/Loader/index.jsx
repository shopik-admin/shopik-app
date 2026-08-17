import classNames from 'common/functions/classNames'
import styles from './loader.module.css'

export default function Loader({ className = '', size }) {
    return <div
        className={classNames(styles.loader, className)}
        style={size && { width: size, height: size }}
    />
}
