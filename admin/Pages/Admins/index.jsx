import DataManager from 'features/DataManager'
import styles from './admins.module.css'

export default function Admins({ }) {
    return <div className={styles.admins}>
        <DataManager
            apiRoute='admin'
            actions={['add', 'export', 'refresh']}
            defaultSort={{ updatedAt: -1 }}
            rowActions={['edit', 'active']}
            onRowClick={console.log}
            cols={[
                { key: 'idNum' },
                { key: 'name', type: 'name' },
                { key: 'roleName' },//*
                { key: 'phone' },
                { key: 'email' },
                { key: 'createdAt', type: 'date' },
                { key: 'updatedAt', type: 'datetime' },
                { key: 'lastLogin', type: 'datetime' },
                { key: 'active', type: 'boolean' },
            ]}
            form={[
                { name: 'name.first', required: true },
                { name: 'name.last', required: true },
                { name: 'roleId', type: 'select', options: 'roles' },
                { name: 'idNum', type: 'idNum', required: true },
                { name: 'phone', type: 'tel', required: true },
                { name: 'email', type: 'email' },
            ]}
        />
    </div>
} 
