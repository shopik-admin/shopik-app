import DataManager from 'features/DataManager'
import apiReq from 'common/functions/apiReq'
import { useModal } from 'common/components/Modal'
import SalesWindowModal from './SalesWindowModal'

export default function ComaxProducts({ }) {
    const { openModal, closeModal } = useModal()

    const salesWindow = {
        icon: 'settings',
        text: 'comax_products_sales_window',
        onClick: () => openModal(
            <SalesWindowModal onClose={closeModal} />,
            { title: 'comax_products_sales_window' }
        ),
        permission: 'comax_product:update'
    }
    const importProducts = {
        icon: 'download',
        text: 'comax_products_import',
        onClick: async ({ refresh }) => {
            await apiReq(`comax_product/import`)
            refresh?.()
        },
        permission: 'comax_product:update'
    }
    const syncProducts = {
        icon: 'sync',
        text: 'comax_products_sync',
        onClick: async ({ refresh }) => {
            await apiReq(`comax_product/sync`)
            refresh?.()
        },
        permission: 'comax_product:update'
    }
    return <DataManager
        apiRoute='comax_product'
        actions={[importProducts, syncProducts, salesWindow, 'export', 'refresh']}
        rowActions={['active']}
        defaultSort={{ lastImportedAt: -1 }}
        cols={[
            { key: 'barcode' },
            { key: 'name' },
            { key: 'description' },
            { key: 'price', type: 'coin' },
            { key: 'trailingItemId' },
            { key: 'trailingItemQuantity', type: 'number' },
            { key: 'trailingItemPrice', type: 'coin' },
            { key: 'trailingPrice', type: 'coin' },
            { key: 'priceWithTrailing', type: 'coin' },
            { key: 'isTrailingItem', type: 'boolean' },
            { key: 'buyingPrice', type: 'coin' },
            { key: 'superDepartment' },
            { key: 'department' },
            { key: 'group' },
            { key: 'subGroup' },
            { key: 'supplier' },
            { key: 'manufacturer' },
            { key: 'active', type: 'boolean' },
            { key: 'showInWeb', type: 'boolean' },
            { key: 'archived', type: 'boolean' },
            { key: 'syncedAt', type: 'date' },
            { key: 'lastImportedAt', type: 'date' },
        ]}
    />
}
