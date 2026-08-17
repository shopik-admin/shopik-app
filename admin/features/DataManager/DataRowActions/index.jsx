import usePermission from 'common/permissions/usePermision'
import styles from './dataRowActions.module.css'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import { useData } from '../DataProvider'

export default function DataRowActions({ row, actions = [] }) {
    const
        { apiRoute, createUpdate, updateData } = useData(),
        updatePermission = usePermission(`${apiRoute}:update`)

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
            })
    }

    return <Flex reverse gap={10} className={styles.dataActions} alignItems='center'>
        {actions
            .map(action => typeof action == 'string' ? defaultActions[action] : action)
            .filter(a => !a.hide)
            .map(({ text, hide, ...action }, i) => <Button
                preventDefault
                stopPropagation
                key={text + action.icon + i} {...action} />)}
    </Flex>
}
