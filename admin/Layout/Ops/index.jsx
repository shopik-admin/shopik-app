import { Outlet, useNavigate } from 'react-router'
import styles from './ops.module.css'
import Text from 'common/components/Text'
import Flex from 'common/components/Flex'
import { useUser } from 'features/User'

export default function OpsLayout() {
    const user = useUser()
    const navigate = useNavigate()
    return <div className={styles.opsLayout}>
        <div className={styles.topBar}>
            <Flex justifyContent='space-between' alignItems='center'>
                <Text bold>Ops — {user?.currentStoreId || user?.storeIds?.[0] || 'no store'}</Text>
                <Text small>{user?.name?.first} {user?.name?.last}</Text>
            </Flex>
        </div>
        <div className={styles.body}>
            <Outlet />
        </div>
        <div className={styles.tabBar}>
            <button onClick={() => navigate('/admin/ops')} className={styles.tab}>Queue</button>
            <button onClick={() => navigate('/admin/ops?mine=1')} className={styles.tab}>Mine</button>
            <button onClick={() => navigate('/admin/ops?status=shipped')} className={styles.tab}>Ship</button>
        </div>
    </div>
}

export function OpsOutlet({ children }) {
    return <div className={styles.opsLayout}><div className={styles.body}>{children}</div></div>
}
