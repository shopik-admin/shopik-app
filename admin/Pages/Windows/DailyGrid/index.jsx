import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import useApi from 'common/functions/useApi'
import apiReq from 'common/functions/apiReq'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import Icon from 'common/components/Icon'
import Loader from 'common/components/Loader'
import Text from 'common/components/Text'
import classNames from 'common/functions/classNames'
import { useText } from 'common/texts/TextProvider'
import { overlapsWindow } from 'common/functions/specialDay.js'
import { todayStr, addDays, formatHourRange } from '../dates.js'
import styles from './daily.module.css'

const toMessage = err => typeof err === 'string' ? err : err?.message || 'something went wrong'

export default function DailyGrid({ date, onDateChange }) {
    const { TR } = useText()
    const effectiveDate = date || todayStr()

    const { data: windows = [], loading, callReq, setData } = useApi('order_window/read', { date: effectiveDate, active: true }, { hold: true })
    const { data: specialDays = [], callReq: callSpecial } = useApi('special_day/read', {}, { hold: true })
    const { data: stores = [] } = useApi('store/read', { limit: 0 })
    const { data: areaGroups = [] } = useApi('area_group/read', { limit: 0 })

    const [storeFilter, setStoreFilter] = useState([])
    const [expandedStores, setExpandedStores] = useState([])
    const [error, setError] = useState(null)

    useEffect(() => {
        callReq({ date: effectiveDate })
        callSpecial({ fromDate: effectiveDate, toDate: effectiveDate })
        setError(null)
    }, [effectiveDate])

    // Cheap auto-refresh while the tab is visible
    useEffect(() => {
        const t = setInterval(() => {
            if (document.visibilityState === 'visible') callReq({ date: effectiveDate, active: true })
        }, 60000)
        return () => clearInterval(t)
    }, [effectiveDate])

    function patchWindow(updated) {
        setData(prev => prev.map(w => w.id === updated.id ? updated : w))
    }

    const visibleWindows = useMemo(() =>
        storeFilter.length ? windows.filter(w => storeFilter.includes(w.storeId)) : windows,
        [windows, storeFilter])

    const slots = useMemo(() => {
        const map = new Map()
        for (const w of visibleWindows)
            map.set(`${w.start}-${w.end}`, { start: w.start, end: w.end })
        return [...map.values()].sort((a, b) => a.start - b.start || a.end - b.end)
    }, [visibleWindows])

    const rows = useMemo(() => {
        const byStore = new Map()
        for (const w of visibleWindows) {
            if (!byStore.has(w.storeId)) byStore.set(w.storeId, {})
            byStore.get(w.storeId)[`${w.start}-${w.end}`] = w
        }
        return [...byStore.entries()]
    }, [visibleWindows])

    const groupsByStore = useMemo(() => {
        const map = new Map()
        for (const g of areaGroups) {
            if (g.active === false) continue
            if (!map.has(g.storeId)) map.set(g.storeId, [])
            map.get(g.storeId).push(g)
        }
        for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'he'))
        return map
    }, [areaGroups])

    function toggleExpand(storeId) {
        setExpandedStores(prev =>
            prev.includes(storeId) ? prev.filter(id => id !== storeId) : [...prev, storeId])
    }

    const activeStores = useMemo(() => {
        const ids = [...new Set(windows.map(w => w.storeId))]
        return ids.map(id => ({
            id,
            name: stores.find(s => s.id === id)?.name || id
        }))
    }, [windows, stores])

    function specialFor(win) {
        return specialDays.filter(sd =>
            sd.date === effectiveDate &&
            (!sd.storeIds?.length || sd.storeIds.includes(win.storeId)) &&
            overlapsWindow(sd, win))
    }

    const dayName = TR(`day-${new Date(effectiveDate + 'T12:00:00').getDay()}`)

    return <Flex col gap={8} className={styles.container}>
        <Flex gap={12} alignItems="center" wrap className={styles.header}>
            <Flex gap={6} alignItems="center">
                <button
                    className={styles.navBtn}
                    title={TR('windows_prev_day')}
                    onClick={() => onDateChange?.(addDays(effectiveDate, -1))}
                >
                    <Icon name="right" />
                </button>
                <input
                    type="date"
                    className={styles.dateInput}
                    value={effectiveDate}
                    onChange={e => e.target.value && onDateChange?.(e.target.value)}
                />
                <button
                    className={styles.navBtn}
                    title={TR('windows_next_day')}
                    onClick={() => onDateChange?.(addDays(effectiveDate, 1))}
                >
                    <Icon name="left" />
                </button>
            </Flex>
            <Flex gap={6} alignItems="center">
                <Icon name="calendar" />
                <Text>{dayName}</Text>
            </Flex>
            <Button size="s" mode="outline" icon="refresh" onClick={() => callReq({ date: effectiveDate, active: true })} loading={loading}>refresh</Button>

            {activeStores.length > 1 && (
                <Flex gap={4} wrap className={styles.chips}>
                    <button
                        className={classNames(styles.chip, !storeFilter.length && styles.chipOn)}
                        onClick={() => setStoreFilter([])}><Text size="none">windows_all_stores</Text></button>
                    {activeStores.map(s => (
                        <button key={s.id}
                            className={classNames(styles.chip, storeFilter.includes(s.id) && styles.chipOn)}
                            onClick={() => setStoreFilter(prev =>
                                prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])}>
                            {s.name}
                        </button>
                    ))}
                </Flex>
            )}
        </Flex>

        {error && <div className={styles.error}><Text size="none">{error}</Text></div>}
        {loading && !windows.length && <Loader size={32} className={styles.loader} />}
        {!loading && !windows.length && (
            <Text mode="sub" className={styles.empty}>windows_no_windows</Text>
        )}

        {!!rows.length && (
            <div className={styles.gridWrap}>
                <div className={styles.grid} style={{ '--cols': Math.max(slots.length, 1) }}>
                    <div className={styles.corner} />
                    {slots.map(slot => (
                        <div key={`${slot.start}-${slot.end}`} className={styles.colHeader}>
                            {formatHourRange(slot.start, slot.end)}
                        </div>
                    ))}

                    {rows.map(([storeId, slotMap]) => {
                        const storeName = stores.find(s => s.id === storeId)?.name || storeId
                        const storeGroups = groupsByStore.get(storeId) || []
                        const expanded = expandedStores.includes(storeId)
                        return (
                            <Fragment key={storeId}>
                                <div className={styles.rowHeader}>
                                    <span className={styles.storeName}>{storeName}</span>
                                    {!!storeGroups.length && (
                                    <button
                                        className={classNames(styles.expander, expanded && styles.expanderOpen)}
                                        title={TR(expanded ? 'windows_hide_groups' : 'windows_show_groups')}
                                        onClick={() => toggleExpand(storeId)}
                                    >
                                            <Icon name="down" />
                                        </button>
                                    )}
                                </div>
                                {slots.map(slot => {
                                    const win = slotMap[`${slot.start}-${slot.end}`]
                                    return (
                                        <WindowCell
                                            key={storeId + `${slot.start}-${slot.end}`}
                                            win={win}
                                            specials={win ? specialFor(win) : []}
                                            onUpdated={patchWindow}
                                            onError={setError}
                                        />
                                    )
                                })}

                                {expanded && storeGroups.map(group => (
                                    <Fragment key={group.id}>
                                        <div className={classNames(styles.rowHeader, styles.groupRowHeader)}>
                                            <i className={styles.groupDot} />
                                            <span className={styles.storeName}>{group.name}</span>
                                        </div>
                                        {slots.map(slot => {
                                            const win = slotMap[`${slot.start}-${slot.end}`]
                                            return (
                                                <GroupCapacityCell
                                                    key={group.id + storeId + `${slot.start}-${slot.end}`}
                                                    win={win}
                                                    group={group}
                                                    onUpdated={patchWindow}
                                                    onError={setError}
                                                />
                                            )
                                        })}
                                    </Fragment>
                                ))}
                            </Fragment>
                        )
                    })}
                </div>
            </div>
        )}

        <Flex gap={16} alignItems="center" wrap className={styles.legend}>
            <span><i className={classNames(styles.dot, styles.green)} /> <Text size="none">available</Text></span>
            <span><i className={classNames(styles.dot, styles.yellow)} /> <Text size="none">windows_almost_full</Text></span>
            <span><i className={classNames(styles.dot, styles.red)} /> <Text size="none">windows_full</Text></span>
            <span><i className={classNames(styles.dot, styles.special)} /> <Text size="none">windows_special_day</Text></span>
            <span><s><Text size="none">windows_closed_window</Text></s></span>
        </Flex>
    </Flex>
}

function GroupCapacityCell({ win, group, onUpdated, onError }) {
    const { TR } = useText()
    const [editing, setEditing] = useState(false)
    const [value, setValue] = useState('')
    const [saving, setSaving] = useState(false)

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
            onUpdated(updated)
            onError(null)
        } catch (e) {
            onError(toMessage(e))
        } finally {
            setSaving(false)
        }
    }

    return <div
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
}

function WindowCell({ win, specials, onUpdated, onError }) {
    const { TR } = useText()
    const [editing, setEditing] = useState(false)
    const [value, setValue] = useState('')
    const [saving, setSaving] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)
    const menuRef = useRef(null)

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
            onUpdated(updated)
            onError(null)
        } catch (e) {
            onError(toMessage(e))
        } finally {
            setSaving(false)
        }
    }

    async function toggleDisabled() {
        setMenuOpen(false)
        setSaving(true)
        try {
            const updated = await apiReq('order_window/update_window', { id: win.id, disabled: !isClosed })
            onUpdated(updated)
            onError(null)
        } catch (e) {
            onError(toMessage(e))
        } finally {
            setSaving(false)
        }
    }

    return <div
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
            <span
                className={classNames(styles.capacity, isClosed && styles.strike)}
                onClick={() => { setValue(String(win.maxCapacity)); setEditing(true) }}
            >
                <b>{win.totalOrders}</b>/<b>{win.maxCapacity}</b>
            </span>
        )}

        <div className={styles.menuWrap} ref={menuRef}>
            <button className={styles.menuItem} onClick={toggleDisabled}>
                <Text size="none">{isClosed ? 'windows_open_window' : 'windows_close_window'}</Text>
            </button>
        </div>
    </div>
}
