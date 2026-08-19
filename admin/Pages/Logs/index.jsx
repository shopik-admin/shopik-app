import { useModal } from 'common/components/Modal'
import DataManager from 'features/DataManager'
import styles from './logs.module.css'
import Log from './Log'

export default function Logs({ }) {
    const { openModal } = useModal()
    return <div className={styles.logs}>
        <DataManager
            apiRoute='log'
            actions={['export', 'refresh']}
            defaultSort={{ updatedAt: -1 }}
            onRowClick={row => openModal(<Log log={row} />, { title: `Log: Request #${row.requestId}` })}
            cols={[
                { key: 'action' },
                { key: 'actor.name', },
                { key: 'status' },
                { key: 'direction', type: 'tr' },
                { key: 'duration', type: 'ms' },
                { key: 'appVersion' },
                { key: 'createdAt', type: 'datetime' },
                { key: 'updatedAt', type: 'datetime' },
            ]}
        />
    </div>
} 