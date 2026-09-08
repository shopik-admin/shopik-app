import DataManager from 'features/DataManager'
import styles from './domains.module.css'

export default function Domains({ }) {
    return <div className={styles.domains}>
        <DataManager
            apiRoute='domain'
            actions={['add', 'export', 'refresh']}
            defaultSort={{ updatedAt: -1 }}
            rowActions={['edit', 'active']}
            onRowClick={console.log}
            cols={[
                { key: 'name' },
                { key: 'url' },
                { key: 'isDefault', type: 'boolean' },
                { key: 'createdAt', type: 'date' },
                { key: 'updatedAt', type: 'datetime' },
                { key: 'active', type: 'boolean' },
            ]}
            form={[
                { name: 'name', required: true },
                { name: 'url', placeholder: 'domain.com' },
                { name: 'isDefault', type: 'checkbox' },
            ]}
        />
    </div>
}
