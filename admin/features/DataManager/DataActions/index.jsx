import usePermission from 'common/permissions/usePermision'
import ContextMenu from 'common/components/ContextMenu'
import { useText } from 'common/texts/TextProvider'
import Button from 'common/components/Button'
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
        add: { icon: 'add', onClick: () => createUpdate(), hide: !createPermission, mode: 'brand' },
        export: { icon: 'csv', tooltip: 'export_csv_tooltip', onClick: exportCurrentView, loading: exporting, hide: !exportPermission },
        refresh: { icon: 'refresh', tooltip: 'refresh_tooltip', onClick: () => callReq() }
    }

    const resolved = actions
        .map(action => typeof action == 'string' ? defaultActions[action] : action)
        .filter(a => a && !a.hide)

    if (!resolved.length) return null

    // Wrap toolbar handlers: they expect a `{ refresh }` payload, not the click event.
    // Toolbar defaults are icon+tooltip only, so the menu needs short labels
    // (tooltips are full sentences, e.g. 'ייצוא כל הנתונים לקובץ CSV').
    const menuText = { add: 'הוסף', export: 'ייצוא CSV', refresh: 'רענן' }
    const toOption = action => {
        const { onClick, text, tooltip, ...rest } = action
        return {
            ...rest,
            text: text || menuText[action.icon] || TR?.(tooltip) || tooltip,
            tooltip,
            onClick: () => onClick?.({ refresh: callReq }),
        }
    }

    // A single visible action renders inline; multiple collapse into a ⋯ menu.
    if (resolved.length === 1) {
        const [{ hide, onClick, ...single }] = resolved
        return <Flex reverse gap={10} className={styles.dataActions} alignItems='center'>
            <Button {...single} onClick={() => onClick?.({ refresh: callReq })} />
        </Flex>
    }

    return <ContextMenu options={resolved.map(toOption)} />
}
