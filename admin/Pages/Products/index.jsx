import DataManager from 'features/DataManager'
import styles from './products.module.css'

export default function Products({ }) {
    return <div className={styles.products}>
        <DataManager
            apiRoute='product'
            actions={['add', 'export', 'refresh']}
            defaultSort={{ updatedAt: -1 }}
            rowActions={['edit']}
            onRowClick={console.log}
            cols={[
                { key: 'image' },
                { key: 'barcode' },
                { key: 'name' },
                { key: 'label' },
                { key: 'category.title' },
                { key: 'createdAt', type: 'date' },
                { key: 'updatedAt', type: 'datetime' },
                { key: 'active', type: 'boolean' },
            ]}
            form={[
                { name: 'barcode', required: true },
                { name: 'name', required: true },
                { name: 'label', required: true },
                { name: 'category.title', required: true },
            ]}
        />
    </div>
}
