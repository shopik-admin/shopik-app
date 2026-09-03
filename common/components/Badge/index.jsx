import Flex from '../Flex'
import styles from './badge.module.css'

export default function Badge({ children }) {
    if (!children && children != 0) return null
    return <Flex center className={styles.badge}>
        {children}
    </Flex>
}
