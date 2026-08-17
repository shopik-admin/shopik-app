import usePermission from 'common/permissions/usePermision'
import Button from 'common/components/Button'
import styles from './dataActions.module.css'
import Flex from '#common/components/Flex'
import { useData } from '../DataProvider'

export default function DataActions({ actions = [] }) {
    const
        { apiRoute, callReq, createUpdate } = useData(),
        createPermission = usePermission(`${apiRoute}:create`),
        exportPermission = usePermission(`${apiRoute}:export`)

    const defaultActions = {
        add: { icon: 'add', onClick: () => createUpdate(), hide: !createPermission },
        export: { icon: 'csv', hide: !exportPermission },
        refresh: { icon: 'refresh', onClick: () => callReq() }
    }

    return <Flex reverse gap={10} className={styles.dataActions} alignItems='center'>
        {actions
            .map(action => typeof action == 'string' ? defaultActions[action] : action)
            .filter(a => !a.hide)
            .map(({ text, hide, onClick, ...action }) => <Button key={`data_action_${action.icon}`} {...action} onClick={() => onClick({ refresh: callReq })} />)}
    </Flex>
}
