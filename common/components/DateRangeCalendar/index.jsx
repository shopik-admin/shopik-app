import { useEffect, useState } from 'react'
import { useText } from 'common/texts/TextProvider'
import Flex from 'common/components/Flex'
import Icon from 'common/components/Icon'
import styles from './dateRangeCalendar.module.css'

export function formatHebrewDate(iso, TR) {
    if (!iso || typeof iso !== 'string') return iso || ''
    const parts = iso.split('-')
    if (parts.length !== 3) return iso
    const [y, m, d] = parts
    const idx = Number(m) - 1
    const month = TR(`month-${idx}-short`) || TR(`month-${idx}`) || m
    return `${Number(d)} ${month} ${y}`
}

export function formatDateRange(gte, lte, TR) {
    if (!gte && !lte) return null
    if (gte && lte) {
        if (gte === lte) return formatHebrewDate(gte, TR)
        return `${formatHebrewDate(gte, TR)} – ${formatHebrewDate(lte, TR)}`
    }
    if (gte) return `${TR('fromDate')}: ${formatHebrewDate(gte, TR)}`
    return `${TR('toDate')}: ${formatHebrewDate(lte, TR)}`
}

// Shared day-precision date-range picker (promoted from DataManager FilterBar).
// value: { $gte: 'YYYY-MM-DD', $lte: 'YYYY-MM-DD' } — either side optional.
// onChange receives the next range or null when cleared.
export default function DateRangeCalendar({ value, onChange }) {
    const { TR } = (useText?.() || {})
    const tr = TR || (k => k)
    const gte = value?.$gte || null
    const lte = value?.$lte || null
    const initial = gte ? new Date(gte) : new Date()
    const [view, setView] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1))
    useEffect(() => {
        const anchor = gte || lte
        if (anchor) setView(new Date(new Date(anchor).getFullYear(), new Date(anchor).getMonth(), 1))
    }, [gte, lte])
    const y = view.getFullYear(), m = view.getMonth()
    const monthName = tr(`month-${m}`) || tr(`month-${m}-short`) || `${m + 1}`
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
    const weekDays = [0, 1, 2, 3, 4, 5, 6].map(i => tr(`day-${i}-short`))
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
                    {formatDateRange(gte, lte, tr)}
                </bdi>
            </div>}
            {(gte || lte) && <button className={styles.clearBtn} onClick={() => {
                onChange(null)
            }}>{tr('reset')}</button>}
        </Flex>
    </div>
}
