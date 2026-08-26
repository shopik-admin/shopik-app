import { useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import useApi from 'common/functions/useApi'
import apiReq from 'common/functions/apiReq'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import Loader from 'common/components/Loader'
import Text from 'common/components/Text'
import classNames from 'common/functions/classNames'
import { useText } from 'common/texts/TextProvider'
import { WINDOWS_PAGE } from 'common/constants.js'
import { addDays, todayStr } from '../dates.js'
import HourRuler from './hourRuler.jsx'
import DayColumn from './dayColumn.jsx'
import WindowCard, { resizeGuard, editCloseGuard } from './windowCard.jsx'
import styles from './weekly.module.css'

const { HOUR_PX, MAX_CAPACITY } = WINDOWS_PAGE
const toMessage = err => typeof err === 'string' ? err : err?.message || 'something went wrong'

let cidCounter = 0
const nextCid = () => `c${Date.now()}_${cidCounter++}`

function cloneWindows(windows = []) {
    return windows.map(w => ({
        dayOfWeek: w.dayOfWeek,
        start: w.start,
        end: w.end,
        maxCapacity: w.maxCapacity,
        leadHours: w.leadHours,
        areaGroups: (w.areaGroups || []).map(({ groupId, capacity }) => ({ groupId, capacity })),
        _cid: nextCid()
    }))
}

function stripForSave(draft) {
    return draft
        .map(({ _cid, ...w }) => {
            const clean = { dayOfWeek: w.dayOfWeek, start: w.start, end: w.end, maxCapacity: w.maxCapacity }
            if (w.leadHours != null) clean.leadHours = w.leadHours
            clean.areaGroups = (w.areaGroups || []).map(({ groupId, capacity }) => ({ groupId, capacity }))
            return clean
        })
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.start - b.start)
}

export default function WeeklyPlan({ onDirtyChange }) {
    const { TR } = useText()
    const { data: templates = [], loading, callReq } = useApi('order_window_template/read', { limit: 0 })
    const { data: stores = [] } = useApi('store/read', { limit: 0 })
    const { data: areaGroups = [] } = useApi('area_group/read', { limit: 0 })

    const [choice, setChoice] = useState('master')
    const [draft, setDraft] = useState(null)
    const [editingCid, setEditingCid] = useState(null)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [saving, setSaving] = useState(false)
    const [scrollTop, setScrollTop] = useState(0)
    const [scrolled, setScrolled] = useState(false)

    const scrollRef = useRef(null)

    useEffect(() => {
        if (scrolled || !draft?.length || !scrollRef.current) return
        const earliest = Math.min(...draft.map(w => w.start))
        scrollRef.current.scrollTop = Math.max(0, earliest - 1) * HOUR_PX
        setScrolled(true)
    }, [draft, scrolled])

    const master = templates.find(t => t.master && t.active !== false)
    const selected = choice === 'master'
        ? master
        : templates.find(t => t.storeId === choice && t.active !== false)

    // Group capacities are per-store; the store-agnostic master has none.
    const storeGroups = useMemo(() =>
        choice === 'master'
            ? []
            : areaGroups.filter(g => g.storeId === choice && g.active !== false),
        [areaGroups, choice])

    useEffect(() => {
        if (!selected?.windows) return
        setDraft(cloneWindows(selected.windows))
        setEditingCid(null)
        setSuccess(null)
    }, [selected?.id])

    // Single-editor policy: any pointerdown outside the open editor closes it.
    // Pointerdowns on cards are ignored so the click handler can switch/toggle
    // editors, and the close timestamp suppresses the accidental "add window"
    // from the same click landing on a column background.
    useEffect(() => {
        if (!editingCid) return
        function onDocPointerDown(e) {
            if (e.target.closest?.('[data-editcard]')) return
            if (e.target.closest?.(`.${styles.card}`)) return
            editCloseGuard.lastClose = Date.now()
            setEditingCid(null)
        }
        document.addEventListener('pointerdown', onDocPointerDown)
        return () => document.removeEventListener('pointerdown', onDocPointerDown)
    }, [editingCid])

    const groupsCanon = w => (w.areaGroups || []).map(g => `${g.groupId}:${g.capacity}`).sort().join(',')
    const canon = w => `${w.dayOfWeek}|${w.start}|${w.end}|${w.maxCapacity}|${w.leadHours ?? ''}|${groupsCanon(w)}`
    const dirty = useMemo(() => {
        if (!selected || !draft) return false
        const a = [...draft].map(canon).sort().join(';')
        const b = [...(selected.windows || [])].map(canon).sort().join(';')
        return a !== b
    }, [draft, selected])

    useEffect(() => { onDirtyChange?.(dirty) }, [dirty])

    const conflicts = useMemo(() => {
        const ids = new Set()
        if (!draft) return ids
        for (let day = 0; day <= 6; day++) {
            const list = draft.filter(w => w.dayOfWeek === day)
            for (let i = 0; i < list.length; i++)
                for (let j = i + 1; j < list.length; j++) {
                    const a = list[i], b = list[j]
                    if (a.start < b.end && b.start < a.end) {
                        ids.add(a._cid)
                        ids.add(b._cid)
                    }
                }
        }
        return ids
    }, [draft])

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

    function updateWin(cid, patch) {
        setDraft(prev => prev.map(w => w._cid === cid ? { ...w, ...patch } : w))
    }

    function toggleEdit(cid) {
        setEditingCid(prev => prev === cid ? null : cid)
    }

    function deleteWin(cid) {
        setEditingCid(null)
        setDraft(prev => prev.filter(w => w._cid !== cid))
    }

    function addWindow(day, hour) {
        // A click that just closed an editor must not create a window
        if (Date.now() - editCloseGuard.lastClose < 300) return
        setError(null)
        setDraft(prev => [...(prev || []), {
            dayOfWeek: day,
            start: hour,
            end: Math.min(23, hour + 2),
            maxCapacity: selected?.windows?.[0]?.maxCapacity ?? Math.min(MAX_CAPACITY, 20),
            leadHours: undefined,
            areaGroups: [],
            _cid: nextCid()
        }])
    }

    function handleDragEnd(event) {
        const { active, delta, over } = event
        const { day: fromDay, cid } = active.data.current || {}
        if (cid == null || fromDay === 6) return

        const targetDay = over?.data.current?.day ?? fromDay
        if (targetDay == null || targetDay === 6) return

        const dh = Math.round(delta.y / HOUR_PX)
        const win = draft.find(w => w._cid === cid)
        if (!win || (!dh && targetDay === fromDay)) return

        const duration = win.end - win.start
        const start = Math.max(0, Math.min(23 - duration, win.start + dh))

        setDraft(prev => prev.map(w => w._cid === cid
            ? { ...w, dayOfWeek: targetDay, start, end: start + duration }
            : w))
    }

    async function createFromMaster(storeId) {
        if (!master) {
            setError('windows_no_master_to_copy')
            return
        }
        try {
            await apiReq('order_window_template/create', { storeId, copyFrom: master.id })
            await callReq({ limit: 0 })
            setChoice(storeId)
            setSuccess('windows_template_created')
        } catch (e) {
            setError(toMessage(e))
        }
    }

    async function save() {
        if (!selected || conflicts.size) return
        setSaving(true)
        setError(null)
        setSuccess(null)
        try {
            await apiReq('order_window_template/update', { id: selected.id, windows: stripForSave(draft) })
            const syncResult = await apiReq('order_window_template/sync', {
                fromDate: addDays(todayStr(), 1),
                ...(choice !== 'master' ? { storeIds: [choice] } : {})
            })
            const totals = syncResult.reduce((acc, s) => ({
                created: acc.created + (+s.synced?.created || 0),
                updated: acc.updated + (+s.synced?.updated || 0),
                deleted: acc.deleted + (+s.synced?.deleted || 0)
            }), { created: 0, updated: 0, deleted: 0 })
            setSuccess(`${TR('windows_saved')} ${TR('windows_sync_created')}: ${totals.created} · ${TR('windows_sync_updated')}: ${totals.updated} · ${TR('windows_sync_disabled')}: ${totals.deleted}`)
            await callReq({ limit: 0 })
        } catch (e) {
            setError(toMessage(e) === 'something went wrong' ? 'windows_save_failed' : toMessage(e))
        } finally {
            setSaving(false)
        }
    }

    if (loading && !templates.length)
        return <Loader size={32} className={styles.loader} />

    return <Flex col gap={10} className={styles.container}>
        <Flex gap={10} alignItems="end" wrap className={styles.toolbar}>
            <label className={styles.selectWrap}>
                <Text size="s">windows_template</Text>
                <select
                    className={styles.select}
                    value={choice}
                    onChange={e => setChoice(e.target.value)}
                >
                    <option value="master">{TR('windows_master_option')}</option>
                    {(stores || []).map(s => (
                        <option key={s.id} value={s.id}>
                            {s.name}{templates.some(t => t.storeId === s.id) ? '' : TR('windows_no_template_suffix')}
                        </option>
                    ))}
                </select>
            </label>

            {choice !== 'master' && !selected && (
                <Button size="s" icon="copy" onClick={() => createFromMaster(choice)}>
                    windows_create_from_master
                </Button>
            )}

            <Flex gap={8} alignItems="center">
                {!!conflicts.size && (
                    <span className={classNames(styles.banner, styles.errorBanner)}>
                        <Text size="none">windows_conflicts</Text>
                    </span>
                )}
                <Button
                    icon="v"
                    disabled={!selected || !!conflicts.size || !dirty}
                    loading={saving}
                    onClick={save}
                >
                    windows_save_and_sync
                </Button>
            </Flex>
        </Flex>

        {error && <div className={classNames(styles.banner, styles.errorBanner)}><Text size="none">{error}</Text></div>}
        {success && <div className={classNames(styles.banner, styles.successBanner)}><Text size="none">{success}</Text></div>}
        {!selected && choice === 'master' && !loading && (
            <div className={styles.hint}><Text size="none">windows_no_master</Text></div>
        )}
        <div className={styles.hint}>
            <Text size="none">windows_weekly_hint</Text>
        </div>

        <div className={styles.canvasArea}>
            <HourRuler scrollTop={scrollTop} height={scrollRef.current?.clientHeight || 600} />
            <div
                ref={scrollRef}
                className={styles.canvasWrap}
                onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
            >
                <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                    <div className={styles.canvas}>
                        {[0, 1, 2, 3, 4, 5, 6].map(day => (
                            <DayColumn
                                key={day}
                                day={day}
                                disabled={day === 6}
                                onAddWindow={addWindow}
                            >
                                {day !== 6 && draft?.filter(w => w.dayOfWeek === day).map(win => (
                                    <WindowCard
                                        key={win._cid}
                                        win={win}
                                        day={day}
                                        conflict={conflicts.has(win._cid)}
                                        storeGroups={storeGroups}
                                        editing={editingCid === win._cid}
                                        onToggleEdit={toggleEdit}
                                        onChange={updateWin}
                                        onDelete={deleteWin}
                                    />
                                ))}
                                {day === 6 && selected?.windows?.filter(w => w.dayOfWeek === 6).map((win, i) => (
                                    <StaticLegacyCard key={i} win={win} />
                                ))}
                            </DayColumn>
                        ))}
                    </div>
                </DndContext>
            </div>
        </div>
    </Flex>
}

function StaticLegacyCard({ win }) {
    const style = {
        top: `${win.start * HOUR_PX}px`,
        height: `${(win.end - win.start) * HOUR_PX}px`
    }
    return <div className={styles.card} style={style}>
        <div className={styles.cardInner}>
            {String(win.start).padStart(2, '0')}:00–{String(win.end).padStart(2, '0')}:00
        </div>
    </div>
}
