import usePermission from 'common/permissions/usePermision'
import ContextMenu from 'common/components/ContextMenu'
import { useText } from 'common/texts/TextProvider'
import styles from './dataActions.module.css'
import apiReq from 'common/functions/apiReq'
import { useData } from '../DataProvider'
import Flex from 'common/components/Flex'
import downloadCsv from './exportCsv'
import { useState } from 'react'

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
        add: { icon: 'add', text: 'action_add', onClick: () => createUpdate(), hide: !createPermission, mode: 'brand' },
        export: { icon: 'csv', text: 'action_export', tooltip: 'export_csv_tooltip', seperator: true, onClick: exportCurrentView, loading: exporting, hide: !exportPermission },
        refresh: { icon: 'refresh', text: 'action_refresh', tooltip: 'refresh_tooltip', onClick: () => callReq() }
    }

    const resolved = actions
        .map(action => typeof action == 'string' ? defaultActions[action] : action)
        .filter(Boolean)

    // Wrap toolbar handlers: they expect a `{ refresh }` payload, not the click event.
    // Falls back both ways so callers specify only one of text/tooltip when they match.
    const toOption = action => {
        const { onClick, text, tooltip, ...rest } = action
        return {
            ...rest,
            text: text || TR?.(tooltip) || tooltip,
            tooltip: tooltip || text,
            onClick: () => onClick?.({ refresh: callReq }),
        }
    }

    // ContextMenu hides denied items and renders null / inline icon / ⋯ menu for 0 / 1 / 2+.
    return <Flex reverse gap={10} className={styles.dataActions} alignItems='center'>
        <ContextMenu options={resolved.map(toOption)} />
    </Flex>
}
