import Flex from '../Flex'
import classNames from 'common/functions/classNames'
import styles from './badge.module.css'

export default function Badge({ children, className = '' }) {
    if (!children && children != 0) return null
    return <Flex center className={classNames(styles.badge, className)}>
        {children}
    </Flex>
}
