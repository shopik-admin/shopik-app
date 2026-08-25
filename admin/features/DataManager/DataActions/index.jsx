import { useState } from 'react'
import usePermission from 'common/permissions/usePermision'
import Button from 'common/components/Button'
import styles from './dataActions.module.css'
import Flex from '#common/components/Flex'
import downloadCsv from './exportCsv'
import apiReq from 'common/functions/apiReq'
import { useData } from '../DataProvider'
import { useText } from 'common/texts/TextProvider'

export default function DataActions({ actions = [], cols = [] }) {
    const
        { apiRoute, data, callReq, createUpdate, search, sort } = useData(),
        { TR } = useText(),
        [exporting, setExporting] = useState(false),
        createPermission = usePermission(`${apiRoute}:create`),
        exportPermission = usePermission(`${apiRoute}:export`)

    async function exportCurrentView() {
        if (exporting) return
        setExporting(true)
        try {
            const rows = await apiReq(`${apiRoute}/read`, { limit: 0, search, sort })
            const date = new Date().toISOString().slice(0, 10)
            downloadCsv(cols, rows || [], `${apiRoute}-${date}.csv`, TR)
        } catch (err) {
            console.error(err)
        } finally {
            setExporting(false)
        }
    }

    const defaultActions = {
        add: { icon: 'add', onClick: () => createUpdate(), hide: !createPermission },
        export: { icon: 'csv', tooltip: 'export_csv_tooltip', onClick: exportCurrentView, loading: exporting, hide: !exportPermission },
        refresh: { icon: 'refresh', tooltip: 'refresh_tooltip', onClick: () => callReq() }
    }

    return <Flex reverse gap={10} className={styles.dataActions} alignItems='center'>
        {actions
            .map(action => typeof action == 'string' ? defaultActions[action] : action)
            .filter(a => !a.hide)
            .map(({ text, hide, onClick, ...action }) => <Button key={`data_action_${action.icon}`} {...action} onClick={() => onClick({ refresh: callReq })} />)}
    </Flex>
}
