import Icon from 'common/components/Icon'
import Text from 'common/components/Text'
import { useText } from 'common/texts/TextProvider'
import { WINDOWS_PAGE } from 'common/constants.js'
import styles from './weekly.module.css'

const { MAX_CAPACITY } = WINDOWS_PAGE

const HOURS = Array.from({ length: 24 }, (_, h) => ({
    value: h,
    text: `${String(h).padStart(2, '0')}:00`
}))

/**
 * Inline editor popover for a single weekly-plan window card.
 */
export default function EditCard({ win, storeGroups = [], onChange, onDelete, onClose }) {
    const { TR } = useText()

    function patchNumber(key, raw, min, max, fallbackNull = false) {
        if (raw === '') {
            onChange({ [key]: fallbackNull ? null : undefined })
            return
        }
        const n = Number(raw)
        if (!Number.isInteger(n)) return
        onChange({ [key]: Math.min(max, Math.max(min, n)) })
    }

    // '' clears the group's dedicated limit; numbers clamp to 0..maxCapacity
    // (0 = closed for the group). maxCapacity itself stays the ceiling.
    function patchGroup(groupId, raw) {
        const rest = (win.areaGroups || []).filter(g => g.groupId !== groupId)
        if (raw === '') {
            onChange({ areaGroups: rest })
            return
        }
        const n = Number(raw)
        if (!Number.isInteger(n)) return
        const capacity = Math.min(win.maxCapacity, Math.max(0, n))
        onChange({ areaGroups: [...rest, { groupId, capacity }] })
    }

    return <div className={styles.editCard} data-editcard="" onClick={e => e.stopPropagation()}>
        <div className={styles.editRow}>
            <span><Text size="none">windows_from</Text></span>
            <select
                className={styles.editSelect}
                value={win.start}
                onChange={e => {
                    const start = Number(e.target.value)
                    onChange({ start: start < win.end ? start : win.start })
                }}
            >
                {HOURS.map(h => <option key={h.value} value={h.value}>{h.text}</option>)}
            </select>
            <span><Text size="none">windows_to</Text></span>
            <select
                className={styles.editSelect}
                value={win.end}
                onChange={e => {
                    const end = Number(e.target.value)
                    onChange({ end: end > win.start ? end : win.end })
                }}
            >
                {HOURS.slice(1).map(h => <option key={h.value} value={h.value}>{h.text}</option>)}
            </select>
        </div>

        <div className={styles.editRow}>
            <span><Text size="none">windows_capacity_label</Text></span>
            <input
                type="number"
                min={1}
                max={MAX_CAPACITY}
                className={styles.editInput}
                value={win.maxCapacity}
                onChange={e => patchNumber('maxCapacity', e.target.value, 1, MAX_CAPACITY)}
            />
        </div>

        <div className={styles.editRow}>
            <span><Text size="none">windows_lead_label</Text></span>
            <input
                type="number"
                min={0}
                max={24}
                placeholder={TR('windows_default')}
                className={styles.editInput}
                defaultValue={win.leadHours ?? ''}
                key={win._cid}
                onChange={e => patchNumber('leadHours', e.target.value, 0, 24, true)}
            />
        </div>

        {!!storeGroups.length && (
            <div className={styles.editGroups}>
                <div className={styles.editGroupsTitle}><Text size="none">windows_group_capacity_title</Text></div>
                {storeGroups.map(group => {
                    const entry = (win.areaGroups || []).find(g => g.groupId === group.id)
                    return (
                        <div key={group.id} className={styles.editRow}>
                            <span className={styles.groupName} title={group.name}>{group.name}:</span>
                            <input
                                type="number"
                                min={0}
                                max={win.maxCapacity}
                                placeholder='—'
                                title={TR('windows_group_limit_hint')}
                                className={styles.editInput}
                                value={entry?.capacity ?? ''}
                                onChange={e => patchGroup(group.id, e.target.value)}
                            />
                        </div>
                    )
                })}
            </div>
        )}

        <div className={styles.editRow}>
            <button type="button" className={styles.deleteBtn} onClick={onDelete}>
                <Text size="none">windows_delete_window</Text>
            </button>
            <button
                type="button"
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--fg-secondary)' }}
                onClick={onClose}
                title={TR('close')}
            >
                <Icon name="x" />
            </button>
        </div>
    </div>
}
