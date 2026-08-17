import classNames from 'common/functions/classNames'
import styles from './overlay.module.css'

export default function Overlay({ className = '', open, children, onClick, ...props }) {
    return <div
        onClick={e => { if (onClick && e.target == e.currentTarget) onClick(e) }}
        className={classNames(styles.overlay, className, [styles.open, open])}
        {...props}
    >
        {children}
    </div>
}