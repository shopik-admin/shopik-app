import styles from './users.module.css'
import DataManager from 'Features/DataManager'

export default function Users({ }) {
    return <div className={styles.products}>
        <DataManager
            apiRoute='user'
            actions={[/* 'add',  */'export', 'refresh']}
            defaultSort={{ updatedAt: -1 }}
            rowActions={['edit']}
            onRowClick={console.log}
            cols={[
                { key: 'idNum' },
                { key: 'name', type: 'name' },
                { key: 'phone' },
                { key: 'email' },
                { key: 'createdAt', type: 'date' },
                { key: 'updatedAt', type: 'datetime' },
                { key: 'active', type: 'boolean' },
            ]}
            form={[
                { name: 'name.first' },
                { name: 'name.last' },
                { name: 'idNum', type: 'idNum', required: true },
                { name: 'phone', type: 'tel', required: true },
                { name: 'email', type: 'email' },
            ]}
        />
    </div>
}
