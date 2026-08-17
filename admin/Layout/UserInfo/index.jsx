import { useUser } from 'Features/User'
import styles from './userInfo.module.css'
import Flex from '#common/components/Flex/index.jsx'

export default function UserInfo({ }) {
    const { name } = useUser()
    return <div className={styles.userInfo}>
        <Flex center className={styles.avatar}>
            {name.first.charAt(0)}{name.last.charAt(0)}
        </Flex>
    </div>
}
