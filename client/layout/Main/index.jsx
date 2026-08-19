import styles from './main.module.css'
import Flex from 'common/components/Flex'

export default function Main({ children }) {
    return <Flex gap={20} tag='main' className={styles.main}>
        {children}
    </Flex>
}
