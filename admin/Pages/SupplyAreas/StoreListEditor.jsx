import { useMemo } from 'react'
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors
} from '@dnd-kit/core'
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
    arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Flex from 'common/components/Flex'
import styles from './supplyAreas.module.css'

function SortableStore({ store, index, onRemove }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: store.id })

    return (
        <li
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={`${styles.storeItem} ${isDragging ? styles.dragging : ''}`}
            {...attributes}
            {...listeners}
        >
            <span className={styles.storeOrder}>{index + 1}</span>
            <span className={styles.storeName}>{store.name}</span>
            <span className={styles.storeTag}>{store.tag}</span>
            <button
                type="button"
                className={styles.removeStore}
                onClick={(e) => { e.stopPropagation(); onRemove(store.id) }}
                title="Remove store"
            >
                x
            </button>
        </li>
    )
}

export default function StoreListEditor({ stores = [], areaStores = [], onChange }) {
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

    const assignedIds = useMemo(() => areaStores.map(s => s.storeId), [areaStores])
    const assignedStores = useMemo(() =>
        assignedIds.map(id => stores.find(s => s.id === id)).filter(Boolean),
        [stores, assignedIds]
    )
    const availableStores = useMemo(() =>
        stores.filter(s => !assignedIds.includes(s.id)),
        [stores, assignedIds]
    )

    function handleDragEnd({ active, over }) {
        if (!over || active.id === over.id) return
        const oldIndex = assignedIds.indexOf(active.id)
        const newIndex = assignedIds.indexOf(over.id)
        if (oldIndex < 0 || newIndex < 0) return
        onChange(arrayMove(assignedIds, oldIndex, newIndex))
    }

    function handleAdd(storeId) {
        if (!storeId || assignedIds.includes(storeId)) return
        onChange([...assignedIds, storeId])
    }

    function handleRemove(storeId) {
        onChange(assignedIds.filter(id => id !== storeId))
    }

    return (
        <div className={styles.storeEditor}>
            <Flex justifyContent="space-between" alignItems="center" className={styles.storeEditorHeader}>
                <h4>Stores (priority order)</h4>
            </Flex>

            {assignedStores.length === 0 ? (
                <div className={styles.empty}>No stores assigned to this area</div>
            ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={assignedIds} strategy={verticalListSortingStrategy}>
                        <ul className={styles.storeList}>
                            {assignedStores.map((store, i) => (
                                <SortableStore key={store.id} store={store} index={i} onRemove={handleRemove} />
                            ))}
                        </ul>
                    </SortableContext>
                </DndContext>
            )}

            <Flex gap={8} className={styles.addStore}>
                <select
                    className={styles.storeSelect}
                    value=""
                    onChange={(e) => handleAdd(e.target.value)}
                >
                    <option value="" disabled>Add store...</option>
                    {availableStores.map(store => (
                        <option key={store.id} value={store.id}>{store.name} ({store.tag})</option>
                    ))}
                </select>
            </Flex>
        </div>
    )
}