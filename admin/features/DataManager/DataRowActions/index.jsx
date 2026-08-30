import usePermission from 'common/permissions/usePermision'
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
    }).filter(Boolean)

    return <Flex reverse gap={10} className={styles.dataActions} alignItems='center'>
        {resolved
            .filter(a => !a.hide)
            .map(({ text, hide, ...action }, i) => <Button
                preventDefault
                stopPropagation
                key={text + action.icon + i} {...action} />)}
    </Flex>
}
