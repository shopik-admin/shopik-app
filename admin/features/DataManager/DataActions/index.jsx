import usePermission from 'common/permissions/usePermision'
import Button from 'common/components/Button'
import styles from './dataActions.module.css'
import Flex from '#common/components/Flex'
import downloadCsv from './exportCsv'
import { useData } from '../DataProvider'
import { useText } from 'common/texts/TextProvider'

export default function DataActions({ actions = [], cols = [] }) {
    const
        { apiRoute, data, callReq, createUpdate } = useData(),
        { TR } = useText(),
        createPermission = usePermission(`${apiRoute}:create`),
        exportPermission = usePermission(`${apiRoute}:export`)

    function exportCurrentView() {
        const date = new Date().toISOString().slice(0, 10)
        downloadCsv(cols, data, `${apiRoute}-${date}.csv`, TR)
    }

    const defaultActions = {
        add: { icon: 'add', onClick: () => createUpdate(), hide: !createPermission },
        export: { icon: 'csv', onClick: exportCurrentView, hide: !exportPermission },
        refresh: { icon: 'refresh', onClick: () => callReq() }
    }

    return <Flex reverse gap={10} className={styles.dataActions} alignItems='center'>
        {actions
            .map(action => typeof action == 'string' ? defaultActions[action] : action)
            .filter(a => !a.hide)
            .map(({ text, hide, onClick, ...action }) => <Button key={`data_action_${action.icon}`} {...action} onClick={() => onClick({ refresh: callReq })} />)}
    </Flex>
}
