import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import useApi from 'common/functions/useApi'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import Icon from 'common/components/Icon'
import Loader from 'common/components/Loader'
import Text from 'common/components/Text'
import classNames from 'common/functions/classNames'
import { useText } from 'common/texts/TextProvider'
import { overlapsWindow } from 'common/functions/specialDay.js'
import { todayStr, addDays, formatHourRange, parseDate } from '../dates.js'
import WindowCell from './WindowCell.jsx'
import GroupCapacityCell from './GroupCapacityCell.jsx'
import styles from './daily.module.css'

export default function DailyGrid({ date, onDateChange, stores = [], areaGroups = [] }) {
    const { TR } = useText()
    const effectiveDate = date || todayStr()

    const { data: windows = [], loading, callReq, setData } = useApi('order_window/read', { date: effectiveDate, active: true }, { hold: true })
    const { data: specialDays = [], callReq: callSpecial } = useApi('special_day/read', {}, { hold: true })

    const [storeFilter, setStoreFilter] = useState([])
    const [expandedStores, setExpandedStores] = useState([])
    const [error, setError] = useState(null)
    const editingRef = useRef(false)
    function setEditing(v) { editingRef.current = v }

    useEffect(() => {
        callReq({ date: effectiveDate })
        callSpecial({ fromDate: effectiveDate, toDate: effectiveDate })
        setError(null)
    }, [effectiveDate])

    // Auto-refresh while the tab is visible and user is not editing
    useEffect(() => {
        const t = setInterval(() => {
            if (document.visibilityState !== 'visible' || document.hidden) return
            if (editingRef.current) return
            const ae = document.activeElement
            if (ae && ae.tagName === 'INPUT' && ae.classList.contains(styles.capacityInput)) return
            callReq({ date: effectiveDate, active: true })
        }, 60000)
        function onVis() {
            // no-op: interval will skip when hidden; keep for future pause/resume logic
        }
        document.addEventListener('visibilitychange', onVis)
        return () => {
            clearInterval(t)
            document.removeEventListener('visibilitychange', onVis)
        }
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

    const daySpecials = useMemo(() =>
        specialDays.filter(sd => sd.date === effectiveDate),
        [specialDays, effectiveDate])

    const dayName = TR(`day-${parseDate(effectiveDate).getDay()}`)

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
            <Flex col gap={4} alignItems="center" className={styles.emptyWrap}>
                {!!daySpecials.length && (
                    <Text className={styles.specialEmptyLabel}>{daySpecials.map(sd => sd.name).join(', ')}</Text>
                )}
                <Text mode="sub" className={styles.empty}>windows_no_windows</Text>
            </Flex>
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
                                            onEditingChange={setEditing}
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
                                                    onEditingChange={setEditing}
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
