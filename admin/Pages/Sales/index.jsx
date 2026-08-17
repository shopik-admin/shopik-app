import DataManager from 'Features/DataManager'
import apiReq from 'common/functions/apiReq.js'
import styles from './sales.module.css'

export default function Sales({ }) {
    const syncSales = {
        icon: 'sync',
        onClick: async ({ refresh }) => {
            await apiReq(`sale/sync`)
            refresh?.()
        },
        permission: 'sale:update'
    }
    return <div className={styles.sales}>
        <DataManager
            apiRoute='sale'
            actions={[syncSales, 'export', 'refresh']}
            defaultSort={{ updatedAt: -1 }}
            cols={[
                { key: 'id' },
                { key: 'name' },
                { key: 'displayName' },
                { key: 'kind', type: 'tr' },
                { key: 'status', type: 'tr' },
                { key: 'start', type: 'datetime' },
                { key: 'end', type: 'datetime' },
                { key: 'amount', type: 'number' },
                { key: 'percent', type: 'number' },
                { key: 'price', type: 'coin' },
                { key: 'createdAt', type: 'date' },
                { key: 'updatedAt', type: 'datetime' },
            ]}
            form={[
                { name: 'name', required: true },
                { name: 'displayName', required: true },
                { name: 'type', type: 'select', options: 'saleTypes', required: true },
                { name: 'kind', type: 'select', options: 'saleKinds', required: true },
                { name: 'barcodes', required: true },
                { name: 'start', type: 'datetime', required: true },
                { name: 'end', type: 'datetime', required: true },
                { name: 'amount', type: 'number', required: true },
            ]}
        />
    </div>
}
