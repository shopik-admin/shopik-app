import DataManager from 'Features/DataManager'
import apiReq from 'common/functions/apiReq.js'

export default function ComaxSales({ }) {
    const importSales = {
        icon: 'download',
        onClick: async ({ refresh }) => {
            await apiReq(`comax_sale/import`)
            refresh?.()
        },
        permission: 'comax_sale:update'
    }
    const syncSales = {
        icon: 'sync',
        onClick: async ({ refresh }) => {
            await apiReq(`comax_sale/sync`)
            refresh?.()
        },
        permission: 'comax_sale:update'
    }
    return <DataManager
        apiRoute='comax_sale'
        actions={[importSales, syncSales, 'export', 'refresh']}
        defaultSort={{ lastImportedAt: -1 }}
        cols={[
            { key: 'comaxId' },
            { key: 'name' },
            { key: 'promotionType' },
            { key: 'fromDate', type: 'date' },
            { key: 'toDate', type: 'date' },
            { key: 'quantity' },
            { key: 'total', type: 'coin' },
            { key: 'swActive', type: 'boolean' },
            { key: 'syncedAt', type: 'date' },
            { key: 'lastImportedAt', type: 'date' },
        ]}
    />
}
