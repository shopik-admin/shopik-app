import { useUser } from 'features/User'
import styles from './userInfo.module.css'
import Flex from '#common/components/Flex/index.jsx'
import Button from '#common/components/Button/index.jsx'
import Text from '#common/components/Text/index.jsx'
import Popover from '#common/components/Popover/index.jsx'

export default function UserInfo({ }) {
    const { name, logout } = useUser()
    return <div className={styles.userInfo}>
        <Popover
            overlay
            button={<Flex center className={styles.avatar}>
                {name.first.charAt(0)}{name.last.charAt(0)}
            </Flex>}
        >
            {({ close }) => <Flex col gap={12} className={styles.menu}>
                <Text bold>{name.first} {name.last}</Text>
                <Button
                    icon='logout'
                    mode='outline'
                    className={styles.logoutButton}
                    onClick={async () => {
                        await logout()
                        close()
                    }}
                >
                    logout
                </Button>
            </Flex>}
        </Popover>
    </div>
}
