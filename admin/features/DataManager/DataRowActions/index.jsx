import usePermission from 'common/permissions/usePermision'
import ContextMenu from 'common/components/ContextMenu'
import { useText } from 'common/texts/TextProvider'
import styles from './dataRowActions.module.css'
import Flex from 'common/components/Flex'
import { useData } from '../DataProvider'
import { useModal } from 'common/components/Modal'
import CashRegisterForm from 'Pages/Stores/CashRegisterForm'

export default function DataRowActions({ row, actions = [] }) {
    const
        { apiRoute, createUpdate, updateData } = useData(),
        { openModal } = useModal(),
        { TR } = useText(),
        updatePermission = usePermission(`${apiRoute}:update`),
        cashPerm = usePermission('cash_register:read')

    const defaultActions = {
        edit: { icon: 'edit', text: 'action_edit', onClick: () => createUpdate(row), hide: !updatePermission },
        active: (!row.active ? {
            text: 'action_activate',
            icon: 'v',
            mode: 'color1',
            onClick: () => updateData({ id: row.id, active: true }),
            seperator: true,
            hide: !updatePermission
        } :
            {
                text: 'action_deactivate',
                icon: 'x',
                mode: 'red',
                onClick: () => updateData({ id: row.id, active: false }),
                seperator: true,
                hide: !updatePermission
            }),
        cashRegister: {
            icon: 'stockSync',
            text: 'action_cash_register',
            seperator: true,
            onClick: () => openModal(<CashRegisterForm storeId={row.id} storeName={row.name} />, { title: `${TR('action_cash_register')} — ${row.name || row.id}` }),
            hide: apiRoute !== 'store' || !cashPerm
        }
    }

    const resolved = actions.map(a => {
        if (typeof a === 'function') return a(row)
        if (typeof a === 'string') return defaultActions[a]
        return a
    }).filter(Boolean)

    // ContextMenu hides denied items and renders null / inline icon / ⋯ menu for 0 / 1 / 2+.
    return <Flex reverse gap={10} className={styles.dataActions} alignItems='center'>
        <ContextMenu options={resolved} row={row} />
    </Flex>
}
