import styles from './users.module.css'
import { useNavigate } from 'react-router'
import DataManager from 'features/DataManager'
import { USER_FORM_FIELDS } from './form'

export default function Users({ }) {
    const navigate = useNavigate()
    return <div className={styles.products}>
        <DataManager
            apiRoute='user'
            actions={[/* 'add',  */'export', 'refresh']}
            defaultSort={{ updatedAt: -1 }}
            rowActions={['edit']}
            onRowClick={row => navigate(`/users/${row.id}`)}
            cols={[
                { key: 'name', type: 'name' },
                { key: 'phone' },
                { key: 'email' },
                { key: 'createdAt', type: 'date' },
                { key: 'updatedAt', type: 'datetime' },
                { key: 'lastLogin', type: 'datetime' },
                { key: 'active', type: 'boolean' },
            ]}
            form={USER_FORM_FIELDS}
        />
    </div>
}
