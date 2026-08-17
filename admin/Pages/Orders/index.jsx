import DataManager from 'Features/DataManager'
import styles from './orders.module.css'

export default function Orders({ }) {
    return <div className={styles.orders}>
        <DataManager
            apiRoute='order'
            actions={['export', 'refresh']}
            defaultSort={{ updatedAt: -1 }}
            rowActions={['active']}
            onRowClick={console.log}
            cols={[
                { key: 'number' },
                { key: 'name', type: 'name' },
                { key: 'phone' },
                { key: 'email' },
                { key: 'status' },
                { key: 'deliveryMethod' },
                { key: 'sum', type: 'coin' },
                { key: 'paid', type: 'boolean' },
                { key: 'deliverBy', type: 'datetime' },
                { key: 'createdAt', type: 'date' },
                { key: 'updatedAt', type: 'datetime' },
                { key: 'active', type: 'boolean' },
            ]}
        />
    </div>
}
