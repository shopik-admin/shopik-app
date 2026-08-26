import { useState } from 'react'
import Icon from 'common/components/Icon'
import Text from 'common/components/Text'
import classNames from 'common/functions/classNames'
import { useText } from 'common/texts/TextProvider'
import { formatHourRange } from '../dates.js'
import styles from './month.module.css'

export default function DayCell({ cell, specials, storeName, isPast, isToday, onAdd, onEditChip, onGoToDay }) {
    const { TR } = useText()
    const [active, setActive] = useState(false)

    const shown = specials.slice(0, 2)
    const overflow = specials.length - shown.length

    return <div
        className={classNames(
            styles.dayCell,
            !cell.inMonth && styles.outMonth,
            isPast && styles.past,
            isToday && styles.today,
            active && styles.active
        )}
        onClick={() => setActive(v => !v)}
        onMouseLeave={() => setActive(false)}
    >
        <span className={styles.dateNum}>{Number(cell.date.slice(8))}</span>

        {shown.map(sd => {
            const ids = sd.storeIds || []
            const label = ids.length ? ids.map(id => storeName(id) || id).join(', ') : ''
            return <button
                key={sd.id}
                type="button"
                className={styles.chip}
                title={`${sd.name}${label ? ` (${label})` : ''} ${TR('windows_click_to_edit')}`}
                onClick={e => {
                    e.stopPropagation()
                    onEditChip?.(sd)
                }}
            >
                {sd.name}
                {ids.length > 0 && <span className={styles.chipStore}>· {label}</span>}
                {!isPast && sd.start != null && <span className={styles.chipStore}> {formatHourRange(sd.start, sd.end)}</span>}
            </button>
        })}
        {overflow > 0 && <span className={styles.overflow}>+{overflow} <Text size="none">{TR('windows_more')}</Text></span>}

        {!isPast && (
            <div className={styles.toolbar}>
                <button
                    type="button"
                    className={classNames(styles.toolBtn, styles.labeled)}
                    title={TR('windows_add_special_day')}
                    onClick={e => {
                        e.stopPropagation()
                        onAdd?.(cell.date)
                    }}
                >
                    <Icon name="add" />
                    <Text size="none">windows_special_day</Text>
                </button>
            </div>
        )}
        <div className={classNames(styles.toolbar)} style={{ top: '28px' }}>
            <button
                type="button"
                className={classNames(styles.toolBtn, styles.goBtn)}
                onClick={e => {
                    e.stopPropagation()
                    onGoToDay?.(cell.date)
                }}
            >
                <Text size="none">windows_view_day</Text>
            </button>
        </div>
    </div>
}
