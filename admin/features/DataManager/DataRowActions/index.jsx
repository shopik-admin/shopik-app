import usePermission from 'common/permissions/usePermision'
import ContextMenu from 'common/components/ContextMenu'
import styles from './dataRowActions.module.css'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import { useData } from '../DataProvider'
import { useModal } from 'common/components/Modal'
import CashRegisterForm from 'Pages/Stores/CashRegisterForm'

export default function DataRowActions({ row, actions = [] }) {
    const
        { apiRoute, createUpdate, updateData } = useData(),
        { openModal } = useModal(),
        updatePermission = usePermission(`${apiRoute}:update`),
        cashPerm = usePermission('cash_register:read')

    const defaultActions = {
        edit: { icon: 'edit', onClick: () => createUpdate(row), hide: !updatePermission },
        active: (!row.active ? {
            text: 'הפוך לפעיל',
            icon: 'v',
            mode: 'color1',
            onClick: () => updateData({ id: row.id, active: true }),
            seperator: true,
            hide: !updatePermission
        } :
            {
                text: 'הפוך ללא פעיל',
                icon: 'x',
                mode: 'red',
                onClick: () => updateData({ id: row.id, active: false }),
                seperator: true,
                hide: !updatePermission
            }),
        cashRegister: {
            icon: 'stockSync',
            text: 'קופה',
            onClick: () => openModal(<CashRegisterForm storeId={row.id} storeName={row.name} />, { title: `קופה — ${row.name || row.id}` }),
            hide: apiRoute !== 'store' || !cashPerm
        }
    }

    const resolved = actions.map(a => {
        if (typeof a === 'function') return a(row)
        if (typeof a === 'string') return defaultActions[a]
        return a
    }).filter(Boolean).filter(a => !a.hide)

    if (!resolved.length) return null

    // A single visible action renders inline; multiple collapse into a ⋯ menu.
    if (resolved.length === 1) {
        const [{ hide, seperator, separator, ...single }] = resolved
        return <Flex reverse gap={10} className={styles.dataActions} alignItems='center'>
            <Button preventDefault stopPropagation {...single} />
        </Flex>
    }

    return <Flex reverse gap={10} className={styles.dataActions} alignItems='center'>
        <ContextMenu options={resolved} row={row} />
    </Flex>
}
