import DataManager from 'Features/DataManager'
import apiReq from 'common/functions/apiReq.js'

export default function ComaxProducts({ }) {
    const importProducts = {
        icon: 'download',
        onClick: async ({ refresh }) => {
            await apiReq(`comax_product/import`)
            refresh?.()
        },
        permission: 'comax_product:update'
    }
    const syncProducts = {
        icon: 'sync',
        onClick: async ({ refresh }) => {
            await apiReq(`comax_product/sync`)
            refresh?.()
        },
        permission: 'comax_product:update'
    }
    return <DataManager
        apiRoute='comax_product'
        actions={[importProducts, syncProducts, 'export', 'refresh']}
        defaultSort={{ lastImportedAt: -1 }}
        cols={[
            { key: 'barcode' },
            { key: 'name' },
            { key: 'description' },
            { key: 'price', type: 'coin' },
            { key: 'superDepartment' },
            { key: 'department' },
            { key: 'group' },
            { key: 'subGroup' },
            { key: 'supplier' },
            { key: 'manufacturer' },
            { key: 'showInWeb', type: 'boolean' },
            { key: 'archived', type: 'boolean' },
            { key: 'syncedAt', type: 'date' },
            { key: 'lastImportedAt', type: 'date' },
        ]}
    />
}
