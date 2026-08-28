import { useEffect, useRef, useState } from 'react'
import apiReq from 'common/functions/apiReq'
import Text from 'common/components/Text'
import classNames from 'common/functions/classNames'
import { useText } from 'common/texts/TextProvider'
import { formatHourRange } from '../dates.js'
import styles from './daily.module.css'

const toMessage = err => typeof err === 'string' ? err : err?.message || 'something went wrong'

export default function WindowCell({ win, specials = [], onUpdated, onError, onEditingChange }) {
    const { TR } = useText()
    const [editing, setEditing] = useState(false)
    const [value, setValue] = useState('')
    const [saving, setSaving] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)
    const menuRef = useRef(null)

    useEffect(() => {
        onEditingChange?.(editing)
        return () => { if (editing) onEditingChange?.(false) }
    }, [editing])

    useEffect(() => {
        if (!menuOpen) return
        function onDocClick(e) {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
        }
        document.addEventListener('pointerdown', onDocClick)
        return () => document.removeEventListener('pointerdown', onDocClick)
    }, [menuOpen])

    if (!win) return <div className={classNames(styles.cell, styles.emptyCell)} />

    const specialNames = specials.map(sd => sd.name).join(', ')
    const isFull = win.totalOrders >= win.maxCapacity
    const isAlmostFull = !isFull && win.totalOrders > 0 && win.totalOrders >= Math.ceil(win.maxCapacity * 0.9)
    const isClosed = !!win.disabled
    const stateClass = isClosed ? styles.closed
        : isFull ? styles.red
            : isAlmostFull ? styles.yellow
                : win.totalOrders === 0 ? styles.green : ''

    async function commitCapacity() {
        setEditing(false)
        const n = Number(value)
        if (!Number.isInteger(n) || n < 1 || n > 100 || n === win.maxCapacity) return
        setSaving(true)
        try {
            const updated = await apiReq('order_window/update_window', { id: win.id, maxCapacity: n })
            onUpdated?.(updated)
            onError?.(null)
        } catch (e) {
            onError?.(toMessage(e))
        } finally {
            setSaving(false)
        }
    }

    async function toggleDisabled() {
        setMenuOpen(false)
        setSaving(true)
        try {
            const updated = await apiReq('order_window/update_window', { id: win.id, disabled: !isClosed })
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
            className={classNames(
                styles.cell,
                stateClass,
                specials.length && styles.specialCell,
                saving && styles.busy
            )}
            title={[
                `${formatHourRange(win.start, win.end)} · ${win.totalOrders}/${win.maxCapacity}`,
                win.manualCapacity ? TR('windows_manual_capacity') : '',
                isClosed ? TR('windows_closed_window') : '',
                specialNames ? `${TR('windows_special_day')}: ${specialNames}` : ''
            ].filter(Boolean).join('\n')}
        >
            <div className={styles.capacityStack}>
                {editing ? (
                    <input
                        autoFocus
                        type="number"
                        min={1}
                        max={100}
                        className={styles.capacityInput}
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        onBlur={commitCapacity}
                        onKeyDown={e => {
                            if (e.key === 'Enter') e.target.blur()
                            if (e.key === 'Escape') setEditing(false)
                        }}
                    />
                ) : (
                    <>
                        <span
                            className={classNames(styles.capacity, isClosed && styles.strike)}
                            onClick={() => { setValue(String(win.maxCapacity)); setEditing(true) }}
                        >
                            <b>{win.totalOrders}</b>/<b>{win.maxCapacity}</b>
                        </span>
                        {!!specials.length && (
                            <span className={styles.specialLabel} title={specialNames}>{specialNames}</span>
                        )}
                    </>
                )}
            </div>

            <div className={styles.menuWrap} ref={menuRef}>
                <button className={styles.menuItem} onClick={toggleDisabled}>
                    <Text size="none">{isClosed ? 'windows_open_window' : 'windows_close_window'}</Text>
                </button>
            </div>
        </div>
    )
}
