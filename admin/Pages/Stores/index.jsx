import DataManager from 'Features/DataManager'
import styles from './stores.module.css'

export default function Stores({ }) {
    return <div className={styles.stores}>
        <DataManager
            apiRoute='store'
            actions={['add', 'export', 'refresh']}
            defaultSort={{ updatedAt: -1 }}
            rowActions={['edit', 'active']}
            onRowClick={console.log}
            cols={[
                { key: 'tag' },
                { key: 'name' },
                { key: 'phone' },
                { key: 'email' },
                { key: 'contactName' },
                { key: 'address.city' },
                { key: 'status', type: 'tr' },
                { key: 'createdAt', type: 'date' },
                { key: 'updatedAt', type: 'datetime' },
                { key: 'active', type: 'boolean' },
            ]}
            form={[
                { name: 'name', required: true },
                { name: 'tag', type: 'tag', required: true, info: 'store_tag_info' },
                { name: 'phone', type: 'tel', required: true },
                { name: 'email', type: 'email', required: true },
                { name: 'contactName' },
                { name: 'address.city', required: true },
                { name: 'address.street', required: true },
                { name: 'address.building', type: 'number', required: true },
                { name: 'address.zip' },
                { name: 'status', type: 'select', options: ['active', 'preview'] },
            ]}
        />
    </div>
}
