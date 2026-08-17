import classNames from 'common/functions/classNames'
import styles from './card.module.css'
import Text from '../Text'

export default function Card({ title, className = '', children, ...props }) {
    return <div
        {...props}
        className={classNames(styles.card, className)}
    >
        {title ? <Text size='h3' bold className={styles.title}>{title}</Text> : null}
        {children}
    </div>
}
