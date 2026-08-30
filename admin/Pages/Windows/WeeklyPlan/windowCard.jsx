import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import classNames from 'common/functions/classNames'
import Icon from 'common/components/Icon'
import Text from 'common/components/Text'
import { useText } from 'common/texts/TextProvider'
import { WINDOWS_PAGE } from 'common/constants.js'
import EditCard from './editCard.jsx'
import styles from './weekly.module.css'

const { HOUR_PX } = WINDOWS_PAGE

export default function WindowCard({ win, day, conflict, readonly, storeGroups = [], editing, resizeGuardRef, onToggleEdit, onChange, onDelete }) {
    const { TR } = useText()
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: win._cid,
        data: { day, cid: win._cid },
        disabled: readonly
    })

    function startResize(e, edge) {
        e.preventDefault()
        e.stopPropagation()
        if (readonly) return
        const startY = e.clientY
        const orig = { start: win.start, end: win.end }
        let last = 0

        function onMove(ev) {
            const dh = Math.round((ev.clientY - startY) / HOUR_PX)
            if (dh === last) return
            last = dh
            if (edge === 'bottom') {
                const end = Math.min(24, Math.max(orig.start + 1, orig.end + dh))
                onChange(win._cid, { end })
            } else {
                const start = Math.max(0, Math.min(orig.end - 1, orig.start + dh))
                onChange(win._cid, { start })
            }
        }
        function onUp() {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
            if (resizeGuardRef) resizeGuardRef.current.lastEnd = Date.now()
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
    }

    return <div
        ref={setNodeRef}
        className={classNames(
            styles.card,
            conflict && styles.conflict,
            editing && styles.editing,
            isDragging && styles.dragging,
            win.end - win.start <= 1 && styles.compact
        )}
        style={{
            top: win.start * HOUR_PX,
            height: (win.end - win.start) * HOUR_PX,
            transform: transform ? CSS.Translate.toString(transform) : undefined
        }}
    >
        <div
            className={classNames(
                styles.cardInner,
                !!storeGroups.length && !!win.areaGroups?.length && styles.cardInnerStacked
            )}
            {...listeners}
            {...attributes}
            onClick={() => !readonly && onToggleEdit?.(win._cid)}
        >
            <span>
                {`${TR('window_card_capacity')} ${win.maxCapacity}`}
                {win.leadHours != null && ` · ${TR('window_card_lead')} ${win.leadHours}h`}
            </span>
            {!!storeGroups.length && !!win.areaGroups?.length && (
                <div className={styles.cardGroups}>
                    {win.areaGroups.map(g => {
                        const name = storeGroups.find(sg => sg.id === g.groupId)?.name
                        if (!name) return null
                        return (
                            <span key={g.groupId} className={styles.cardGroup} title={`${name}: ${g.capacity}`}>
                                <i className={styles.groupDot} />
                                {name}: {g.capacity}
                            </span>
                        )
                    })}
                </div>
            )}
        </div>

        {!readonly && <>
            <div className={styles.handleTop} onPointerDown={e => startResize(e, 'top')} />
            <div className={styles.handleBottom} onPointerDown={e => startResize(e, 'bottom')} />

            <button
                className={styles.quickDelete}
                title={TR('windows_delete_window')}
                onClick={e => { e.stopPropagation(); onDelete(win._cid) }}
                onPointerDown={e => e.stopPropagation()}
            >
                <Icon name="trash" />
            </button>

            {editing && (
                <EditCard
                    win={win}
                    storeGroups={storeGroups}
                    onChange={(patch) => onChange(win._cid, patch)}
                    onDelete={() => { onToggleEdit(win._cid); onDelete(win._cid) }}
                    onClose={() => onToggleEdit(win._cid)}
                />
            )}
        </>}
    </div>
}
