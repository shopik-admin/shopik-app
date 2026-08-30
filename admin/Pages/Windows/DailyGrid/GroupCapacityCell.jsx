import { useEffect, useState } from 'react'
import apiReq from 'common/functions/apiReq'
import Icon from 'common/components/Icon'
import classNames from 'common/functions/classNames'
import { useText } from 'common/texts/TextProvider'
import styles from './daily.module.css'

const toMessage = err => typeof err === 'string' ? err : err?.message || 'something went wrong'

export default function GroupCapacityCell({ win, group, onUpdated, onError, onEditingChange }) {
    const { TR } = useText()
    const [editing, setEditing] = useState(false)
    const [value, setValue] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        onEditingChange?.(editing)
        return () => { if (editing) onEditingChange?.(false) }
    }, [editing])

    if (!win) return <div className={classNames(styles.cell, styles.emptyCell)} />

    const entry = (win.areaGroups || []).find(g => g.groupId === group.id)
    const isClosed = !!win.disabled
    const isFull = entry ? entry.count >= entry.capacity : false

    async function commitCapacity() {
        setEditing(false)
        const raw = value.trim()
        if (raw === '') {
            if (!entry) return
        } else {
            const n = Number(raw)
            // 0 = closed for the group; clearing the field deletes the limit.
            if (!Number.isInteger(n) || n < 0 || n > win.maxCapacity || n === entry?.capacity) return
        }
        await saveGroups(raw === ''
            ? (win.areaGroups || []).filter(g => g.groupId !== group.id)
            : [...(win.areaGroups || []).filter(g => g.groupId !== group.id), { groupId: group.id, capacity: Number(raw) }])
    }

    async function deleteLimit() {
        setEditing(false)
        if (!entry) return
        await saveGroups((win.areaGroups || []).filter(g => g.groupId !== group.id))
    }

    async function saveGroups(areaGroups) {
        // Full config payload; the server merges live counters back in.
        setSaving(true)
        try {
            const updated = await apiReq('order_window/update_window', { id: win.id, areaGroups })
            onUpdated?.(updated)
            onError?.(null)
        } catch (e) {
            onError?.(toMessage(e))
        } finally {
            setSaving(false)
        }
    }

    return (
        <div
            className={classNames(styles.cell, styles.groupCell, isFull && styles.groupCellFull, saving && styles.busy)}
            title={[
                `${group.name} · ${entry ? `${entry.count}/${entry.capacity}` : '—'}`,
                isClosed ? TR('windows_closed_window') : '',
                TR('windows_group_limit_hint')
            ].filter(Boolean).join('\n')}
        >
            {editing ? (
                <span className={styles.editWrap}>
                    <input
                        autoFocus
                        type="number"
                        min={0}
                        max={win.maxCapacity}
                        className={styles.capacityInput}
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        onBlur={commitCapacity}
                        onKeyDown={e => {
                            if (e.key === 'Enter') e.target.blur()
                            if (e.key === 'Escape') setEditing(false)
                        }}
                    />
                    {entry && (
                        <button
                            type="button"
                            className={styles.limitDelete}
                            title={TR('windows_delete_limit')}
                            onMouseDown={e => e.preventDefault()}
                            onClick={deleteLimit}
                        >
                            <Icon name="trash" />
                        </button>
                    )}
                </span>
            ) : (
                <span
                    className={classNames(styles.capacity, isClosed && styles.strike, !entry && styles.unset)}
                    onClick={() => { setValue(entry ? String(entry.capacity) : ''); setEditing(true) }}
                >
                    {entry ? <><b>{entry.count}</b>/<b>{entry.capacity}</b></> : <b>—</b>}
                </span>
            )}
        </div>
    )
}
