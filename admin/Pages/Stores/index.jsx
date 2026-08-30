import DataManager from 'features/DataManager'
import styles from './stores.module.css'

export default function Stores({ }) {
    return <div className={styles.stores}>
        <DataManager
            apiRoute='store'
            actions={['add', 'export', 'refresh']}
            defaultSort={{ updatedAt: -1 }}
            rowActions={['edit', 'active', 'cashRegister']}
            onRowClick={console.log}
            cols={[
                { key: 'name' },
                { key: 'address.city' },
                { key: 'address.street' },
                { key: 'address.building' },
                { key: 'createdAt', type: 'date' },
                { key: 'updatedAt', type: 'datetime' },
                { key: 'active', type: 'boolean' },
            ]}
            form={[
                { name: 'name', required: true },
                { name: 'address.city', required: true },
                { name: 'address.street', required: true },
                { name: 'address.building', type: 'number', required: true },
                { name: 'status', type: 'select', options: ['active', 'preview'] },
            ]}
        />
    </div>
}
