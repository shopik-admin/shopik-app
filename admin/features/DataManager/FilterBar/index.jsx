import { useEffect, useState, useMemo, useRef } from 'react'
import { useText } from 'common/texts/TextProvider'
import { useData } from '../DataProvider'
import apiReq from 'common/functions/apiReq'
import Popover from 'common/components/Popover'
import Icon from 'common/components/Icon'
import Flex from 'common/components/Flex'
import DataSearch from '../DataSearch'
import DataActions from '../DataActions'
import styles from './filterBar.module.css'

// ponytail: single component handles descriptors + store lookup + chips; reuse Popover/Button

const LABEL_OVERRIDES = {
    storeId: 'store_address_title'
}

function getLabel(TR, key) {
    const override = LABEL_OVERRIDES[key]
    if (override) return TR(override)
    return TR(key) || key
}

function formatHebrewDate(iso, TR) {
    if (!iso || typeof iso !== 'string') return iso || ''
    const parts = iso.split('-')
    if (parts.length !== 3) return iso
    const [y, m, d] = parts
    const idx = Number(m) - 1
    const month = TR(`month-${idx}-short`) || TR(`month-${idx}`) || m
    return `${Number(d)} ${month} ${y}`
}

function formatDateRange(gte, lte, TR) {
    if (!gte && !lte) return null
    if (gte && lte) {
        if (gte === lte) return formatHebrewDate(gte, TR)
        return `${formatHebrewDate(gte, TR)} – ${formatHebrewDate(lte, TR)}`
    }
    return null
}

function useVisibleCount(mainCount) {
    const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
    useEffect(() => {
        const h = () => setW(window.innerWidth)
        window.addEventListener('resize', h)
        return () => window.removeEventListener('resize', h)
    }, [])
    if (w < 600) return 0
    if (w < 900) return Math.min(1, mainCount)
    if (w < 1200) return Math.min(2, mainCount)
    return mainCount
}

function isActive(filter, key) {
    const v = filter[key]
    if (v == null) return false
    if (typeof v === 'object') {
        if (Array.isArray(v.$in)) return v.$in.length > 0
        return v.$gte != null || v.$lte != null || v.$gt != null || v.$lt != null
    }
    return true
}

export default function FilterBar({ actions, cols }) {
    const { apiRoute, filter, setFilter } = useData()
    const { TR } = useText()
    const [descriptors, setDescriptors] = useState([])
    const [stores, setStores] = useState([]) // for storeId

    useEffect(() => {
        if (!apiRoute) return
        apiReq(`${apiRoute}/filters`, {}).then(setDescriptors).catch(() => { })
    }, [apiRoute])

    // fetch stores for storeId dropdown labels
    useEffect(() => {
        if (!descriptors.some(d => d.type === 'store')) return
        apiReq('store/read', { limit: 100 }).then(setStores).catch(() => { })
    }, [descriptors])

    const storeMap = useMemo(() => Object.fromEntries(stores.map(s => [s.id, s.name || s.id])), [stores])

    const mainDescriptors = descriptors.filter(d => d.main)
    const otherDescriptors = descriptors.filter(d => !d.main)
    const visibleCount = useVisibleCount(mainDescriptors.length)
    const visible = mainDescriptors.slice(0, visibleCount)
    const overflow = [...mainDescriptors.slice(visibleCount), ...otherDescriptors]

    // ponytail: keep hooks before early return
    const isFiltered = Object.keys(filter).length > 0
    if (!descriptors.length) {
        // still show search + actions card when no descriptors (e.g. other collections)
        return <div className={styles.wrapper}>
            <div className={styles.topRow}>
                <Flex gap={10} alignItems='center' className={styles.leftGroup}>
                    {actions?.length ? <DataActions actions={actions} cols={cols} /> : null}
                    <div className={styles.searchWrap}><DataSearch /></div>
                </Flex>
            </div>
        </div>
    }
    return <div className={styles.wrapper}>
        <div className={styles.topRow}>
            <Flex gap={10} alignItems='center' className={styles.leftGroup}>
                {actions?.length ? <DataActions actions={actions} cols={cols} /> : null}
                <div className={styles.searchWrap}><DataSearch /></div>
            </Flex>
            <Flex gap={10} alignItems='center' wrap className={styles.bar}>
                {overflow.length > 0 && <OverflowDropdown descriptors={overflow} filter={filter} setFilter={setFilter} TR={TR} storeMap={storeMap} />}
                {visible.map(d => (
                    <FilterPill key={d.key} descriptor={d} filter={filter} setFilter={setFilter} TR={TR} storeMap={storeMap} />
                ))}
            </Flex>
        </div>
        {isFiltered && <div className={styles.separator} />}
        <FilterChips filter={filter} setFilter={setFilter} descriptors={descriptors} TR={TR} storeMap={storeMap} />
    </div>
}

function FilterPill({ descriptor, filter, setFilter, TR, storeMap }) {
    const label = getLabel(TR, descriptor.key)
    const active = isActive(filter, descriptor.key)
    const count = filter[descriptor.key]?.$in?.length || (active ? 1 : 0)
    const isDate = descriptor.type === 'date'
    const dateText = isDate ? formatDateRange(filter[descriptor.key]?.$gte, filter[descriptor.key]?.$lte, TR) : null
    const displayText = isDate && dateText ? dateText : label
    return <Popover
        button={<button className={`${styles.pill} ${active ? styles.active : ''} ${isDate ? styles.datePill : ''}`}>
            {isDate && <Icon name='calendar' className={styles.chevron} />}
            <span>{displayText}</span>
            {active && !isDate && <span className={styles.badge}>{count > 1 ? count : '•'}</span>}
            <Icon name='down' className={styles.chevron} />
        </button>}
    >
        {({ close }) => <div className={styles.popoverContent}>
            <FilterControl descriptor={descriptor} filter={filter} setFilter={setFilter} TR={TR} storeMap={storeMap} close={close} />
        </div>}
    </Popover>
}

function OverflowDropdown({ descriptors, filter, setFilter, TR, storeMap }) {
    const activeCount = descriptors.filter(d => isActive(filter, d.key)).length
    return <Popover
        button={<button className={`${styles.pill} ${styles.overflowPill}`}>
            <Flex gap={8}>
                <Icon name='filter' />
                <span>{TR('filter')}</span>
                {activeCount > 0 && <span className={styles.badge}>{activeCount}</span>}
            </Flex>
            <Icon name='down' className={styles.chevron} />
        </button>}
    >
        {({ close }) => <div className={styles.overflowContent}>
            {descriptors.map(d => (
                <div key={d.key} className={styles.overflowItem}>
                    <div className={styles.overflowLabel}>{getLabel(TR, d.key)}</div>
                    <FilterControl descriptor={d} filter={filter} setFilter={setFilter} TR={TR} storeMap={storeMap} />
                </div>
            ))}
        </div>}
    </Popover>
}

function FilterControl({ descriptor, filter, setFilter, TR, storeMap }) {
    const { key, type, options } = descriptor
    const value = filter[key]

    if (type === 'boolean') {
        const checked = value === true
        return <label className={styles.checkRow}>
            <input type='checkbox' checked={checked} onChange={e => {
                if (e.target.checked) setFilter(prev => ({ ...prev, [key]: true }))
                else {
                    const next = { ...prev }
                    delete next[key]
                    setFilter(next)
                }
            }} />
            <span>{getLabel(TR, key)}</span>
        </label>
    }

    if (type === 'date') {
        const gte = value?.$gte || ''
        const lte = value?.$lte || ''
        return <Flex gap={8} col>
            <DateRangeCalendar value={value} TR={TR} onChange={nextRange => {
                if (!nextRange || (!nextRange.$gte && !nextRange.$lte)) {
                    const n = { ...filter }; delete n[key]; setFilter(n)
                } else {
                    setFilter(prev => ({ ...prev, [key]: nextRange }))
                }
            }} />
        </Flex>
    }

    if (type === 'enum') {
        return <div className={styles.enumList}>
            {(options || []).map(opt => {
                const checked = Array.isArray(value?.$in) ? value.$in.includes(opt) : false
                const label = TR(opt) !== opt ? TR(opt) : opt
                return <label key={opt} className={styles.checkRow}>
                    <input type='checkbox' checked={checked} onChange={e => {
                        setFilter(prev => {
                            const cur = prev[key]?.$in || []
                            let nextIn
                            if (e.target.checked) nextIn = [...cur, opt]
                            else nextIn = cur.filter(v => v !== opt)
                            if (!nextIn.length) { const n = { ...prev }; delete n[key]; return n }
                            return { ...prev, [key]: { $in: nextIn } }
                        })
                    }} />
                    <span>{label}</span>
                </label>
            })}
        </div>
    }

    if (type === 'store') {
        // stores fetched separately
        const entries = Object.entries(storeMap)
        if (!entries.length) return <div>{TR('loading') || '...'}</div>
        return <div className={styles.enumList}>
            {entries.map(([id, name]) => {
                const checked = Array.isArray(value?.$in) ? value.$in.includes(id) : false
                return <label key={id} className={styles.checkRow}>
                    <input type='checkbox' checked={checked} onChange={e => {
                        setFilter(prev => {
                            const cur = prev[key]?.$in || []
                            let nextIn
                            if (e.target.checked) nextIn = [...cur, id]
                            else nextIn = cur.filter(v => v !== id)
                            if (!nextIn.length) { const n = { ...prev }; delete n[key]; return n }
                            return { ...prev, [key]: { $in: nextIn } }
                        })
                    }} />
                    <span>{name}</span>
                </label>
            })}
        </div>
    }

    // string fallback — not rendered as pill filter
    return <div style={{ fontSize: 13, opacity: .6 }}>{TR('search')} — {key}</div>
}

function isoToIsoDay(iso) { return iso } // helper kept for readability
function DateRangeCalendar({ value, TR, onChange }) {
    const gte = value?.$gte || null
    const lte = value?.$lte || null
    const initial = gte ? new Date(gte) : new Date()
    const [view, setView] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1))
    useEffect(() => {
        if (gte) setView(new Date(new Date(gte).getFullYear(), new Date(gte).getMonth(), 1))
    }, [gte])
    const y = view.getFullYear(), m = view.getMonth()
    const monthName = TR(`month-${m}`) || TR(`month-${m}-short`) || `${m + 1}`
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const firstDay = new Date(y, m, 1).getDay() // 0 Sun
    const cells = []
    for (let i = 0; i < firstDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    function toIso(day) {
        const mm = String(m + 1).padStart(2, '0'), dd = String(day).padStart(2, '0')
        return `${y}-${mm}-${dd}`
    }
    function isSelected(day) {
        if (!day) return false
        const iso = toIso(day)
        return iso === gte || iso === lte
    }
    function isInRange(day) {
        if (!day || !gte || !lte) return false
        const iso = toIso(day)
        return iso > gte && iso < lte
    }
    function onDayClick(day) {
        if (!day) return
        const iso = toIso(day)
        if (!gte) {
            onChange({ $gte: iso, $lte: iso })
            return
        }
        if (gte && lte) {
            if (gte === lte) {
                if (iso === gte) { onChange(null); return }
                if (iso > gte) { onChange({ $gte: gte, $lte: iso }); return }
                onChange({ $gte: iso, $lte: gte }); return
            }
            // two distinct days
            if (iso === gte) { onChange({ $gte: lte, $lte: lte }); return }
            if (iso === lte) { onChange({ $gte: gte, $lte: gte }); return }
            onChange({ $gte: iso, $lte: iso }); return
        }
        // legacy single gte without lte
        const cur = gte
        if (iso === cur) { onChange(null); return }
        if (iso > cur) onChange({ $gte: cur, $lte: iso })
        else onChange({ $gte: iso, $lte: cur })
    }
    const weekDays = [0, 1, 2, 3, 4, 5, 6].map(i => TR(`day-${i}-short`) || ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'][i])
    return <div className={styles.calendar}>
        <div className={styles.calendarHeader}>
            <button type='button' className={styles.calendarNav} onClick={() => setView(new Date(y, m - 1, 1))}><Icon name='right' /></button>
            <span>{monthName} {y}</span>
            <button type='button' className={styles.calendarNav} onClick={() => setView(new Date(y, m + 1, 1))}><Icon name='left' /></button>
        </div>
        <div className={styles.calendarGrid}>
            {weekDays.map(d => <div key={d} className={styles.calendarWeekDay}>{d}</div>)}
            {cells.map((day, idx) => {
                if (day == null) return <div key={`e-${idx}`} />
                const sel = isSelected(day)
                const range = isInRange(day)
                return <button key={day} type='button' onClick={() => onDayClick(day)} className={`${styles.calendarDay} ${sel ? styles.calendarDaySelected : ''} ${range ? styles.calendarDayRange : ''}`}>{day}</button>
            })}
        </div>
        <Flex justifyContent='center' style={{ marginTop: '8px' }}>
            {(gte || lte) && <div className={styles.calendarFooter} dir='rtl'>
                <bdi>
                    {formatDateRange(gte, lte, TR)}
                </bdi>
            </div>}
            {(gte || lte) && <button className={styles.clearBtn} onClick={() => {
                onChange(null)
            }}>{TR('reset')}</button>}
        </Flex>
    </div>
}

function FilterChips({ filter, setFilter, descriptors, TR, storeMap }) {
    const chips = []
    for (const [key, val] of Object.entries(filter)) {
        if (val == null) continue
        if (val === true || val === false) {
            chips.push({ key, label: `${getLabel(TR, key)}`, onRemove: () => { const n = { ...filter }; delete n[key]; setFilter(n) } })
        } else if (typeof val === 'object' && Array.isArray(val.$in)) {
            for (const v of val.$in) {
                let label = v
                if (key === 'storeId') label = storeMap[v] || v
                else label = TR(v) !== v ? TR(v) : v
                chips.push({
                    key: `${key}:${v}`, label,
                    onRemove: () => setFilter(prev => {
                        const cur = prev[key]?.$in || []
                        const next = cur.filter(x => x !== v)
                        if (!next.length) { const n = { ...prev }; delete n[key]; return n }
                        return { ...prev, [key]: { $in: next } }
                    })
                })
            }
        } else if (typeof val === 'object' && (val.$gte != null || val.$lte != null)) {
            const from = val.$gte || ''
            const to = val.$lte || ''
            const label = formatDateRange(from, to, TR)
            chips.push({
                key,
                label,
                onRemove: () => {
                    const n = { ...filter }
                    delete n[key]
                    setFilter(n)
                }
            })
        }
    }

    if (!chips.length) return null

    return <Flex gap={8} alignItems='center' wrap className={styles.chips}>
        {chips.map(c => (
            <span key={c.key} className={styles.chip}>
                {c.label}
                <button className={styles.chipX} onClick={c.onRemove} aria-label='remove'><Icon name='x' /></button>
            </span>
        ))}
        <button className={styles.clearAll} onClick={() => setFilter({})}>{TR('clearAll') || 'נקה הכל'}</button>
    </Flex>
}
