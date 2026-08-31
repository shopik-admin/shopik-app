import { useDroppable } from '@dnd-kit/core'
import classNames from 'common/functions/classNames'
import Icon from 'common/components/Icon'
import { useText } from 'common/texts/TextProvider'
import { WINDOWS_PAGE } from 'common/constants.js'
import styles from './weekly.module.css'

const { HOUR_PX } = WINDOWS_PAGE

export default function DayColumn({ day, children, disabled, resizeGuardRef, onAddWindow }) {
    const { TR } = useText()
    const { setNodeRef, isOver } = useDroppable({
        id: `day-${day}`,
        disabled,
        data: { day }
    })

    return <div className={classNames(styles.dayColumn, disabled && styles.disabled, isOver && styles.over)}>
        <div className={styles.dayHeader}>
            {TR(`day-${day}-short`)}
            {!disabled && (
                <button
                    className={styles.addBtn}
                    title={TR('windows_add_window')}
                    onClick={() => onAddWindow?.(day, WINDOWS_PAGE.FOCUS_START_HOUR)}
                >
                    <Icon name="add" />
                </button>
            )}
        </div>
        <div
            ref={setNodeRef}
            className={styles.dayBody}
            style={{
                height: 24 * HOUR_PX,
                ['--hour-px']: `${HOUR_PX}px`
            }}
            onClick={e => {
                if (e.target !== e.currentTarget) return
                if (resizeGuardRef && Date.now() - resizeGuardRef.current.lastEnd < 300) return
                const rect = e.currentTarget.getBoundingClientRect()
                const h = Math.max(0, Math.min(23, Math.floor((e.clientY - rect.top) / HOUR_PX)))
                onAddWindow?.(day, h)
            }}
        >
            {children}
        </div>
    </div>
}
