import { useEffect, useMemo, useRef, useState } from 'react'
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useDraggable,
    useSensor,
    useSensors
} from '@dnd-kit/core'
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useApi from 'common/functions/useApi'
import apiReq from 'common/functions/apiReq'
import Button from 'common/components/Button'
import Card from 'common/components/Card'
import CategoryIcon from 'common/components/CategoryIcon'
import Checkbox from 'common/components/Checkbox'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import { useModal } from 'common/components/Modal'
import usePermission from 'common/permissions/usePermision'
import classNames from 'common/functions/classNames'
import { siblingTargetFor } from './siblingTarget.js'
import styles from './menuCategories.module.css'

const MAX_ICON_BYTES = 4 * 1024 * 1024
const ICON_EXTENSIONS = /\.(png|jpe?g|webp)$/i
const ICON_ACCEPT = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp'
const SUB_GROUP_PREFIX = 'sub:'

const sortSiblings = (a, b) =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
    String(a.name).localeCompare(String(b.name), 'he')

function buildTree(categories) {
    const byParent = new Map()
    for (const category of categories) {
        const key = category.parentId || null
        if (!byParent.has(key)) byParent.set(key, [])
        byParent.get(key).push(category)
    }

    const build = parentId => (byParent.get(parentId) || [])
        .slice()
        .sort(sortSiblings)
        .map(category => ({ ...category, children: build(category.id) }))

    return build(null)
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error || new Error('file read failed'))
        reader.readAsDataURL(file)
    })
}

/** Shared drag activator: dragging starts on the handle, so rows stay clickable. */
function DragHandle({ innerRef, attributes, listeners, label }) {
    return <button
        type='button'
        className={styles.grip}
        ref={innerRef}
        aria-label={label}
        title={label}
        {...attributes}
        {...listeners}
    >
        <Icon name='grip' />
    </button>
}

function CategoryRow({ node, depth, open, count, selected, drag, canUpdate, onSelect, onToggle }) {
    const {
        attributes, listeners, setNodeRef, setActivatorNodeRef,
        transform, transition, isDragging, isOver
    } = useSortable({
        id: node.id,
        disabled: !canUpdate,
        data: { categoryId: node.id }
    })

    const hasChildren = node.children?.length > 0
    // Only the node the drop would actually land on gets highlighted.
    const canReorderHere = drag?.kind === 'category' && drag.dropId === node.id

    return <div
        ref={setNodeRef}
        style={{
            paddingInlineStart: `${depth * 14 + 4}px`,
            transform: CSS.Transform.toString(transform),
            transition
        }}
        className={classNames(
            styles.node,
            selected && styles.selected,
            isDragging && styles.dragging,
            isOver && canReorderHere && styles.dropTarget,
            isOver && drag?.kind === 'subgroup' && styles.assignTarget,
            node.active === false && styles.inactive
        )}
        onClick={() => onSelect(node.id)}
    >
        {canUpdate && <DragHandle
            innerRef={setActivatorNodeRef}
            attributes={attributes}
            listeners={listeners}
            label='גרירה ושינוי סדר'
        />}

        {hasChildren
            ? <button
                type='button'
                className={styles.chevron}
                onClick={event => {
                    event.stopPropagation()
                    onToggle(node.id)
                }}
            >
                <Icon
                    name='left'
                    className={classNames(styles.chevronIcon, [styles.chevronOpen, open])}
                />
            </button>
            : <span className={styles.chevronPlaceholder} />}

        <CategoryIcon icon={node.icon} fallback={false} className={styles.nodeIcon} />
        <span className={styles.nodeName}>{node.name}</span>
        <span className={styles.levelTag}>L{node.level}</span>
        {count ? <span className={styles.badge}>{count}</span> : null}
        {node.active === false ? <span className={styles.inactiveTag}>כבוי</span> : null}
    </div>
}

function SubGroupRow({ entry, isAssigned, canUpdate, selectedId, onAssign }) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
        id: `${SUB_GROUP_PREFIX}${entry.code}`,
        disabled: !canUpdate,
        data: {
            subGroupCode: entry.code,
            categoryId: entry.categoryId || null,
            label: entry.subGroup || `קוד ${entry.code}`
        }
    })

    return <div
        ref={setNodeRef}
        className={classNames(styles.subGroup, isDragging && styles.dragging)}
    >
        {canUpdate && <DragHandle
            innerRef={setActivatorNodeRef}
            attributes={attributes}
            listeners={listeners}
            label='גרירה אל קטגוריה'
        />}

        <div className={styles.subGroupText}>
            <Text bold>{entry.subGroup || `קוד ${entry.code}`}</Text>
            <Text size='s' mode='sub'>{entry.oldPath || 'ללא היררכיה מקומקס'}</Text>
        </div>
        <span className={styles.code}>{entry.code}</span>
        <span className={styles.badge}>{entry.productCount}</span>
        {isAssigned
            ? <Button
                icon='trash'
                mode='text'
                tooltip='הסרת שיוך'
                permission='category:update'
                onClick={() => onAssign(entry.code, null)}
            />
            : <Button
                icon='add'
                mode='text'
                tooltip='שיוך לקטגוריה הנבחרת'
                permission='category:update'
                disabled={!selectedId}
                onClick={() => onAssign(entry.code, selectedId)}
            />}
    </div>
}

export default function MenuCategories() {
    const { data, loading, error, callReq, setData } = useApi('category/tree')
    const { openModal, closeModal } = useModal()
    const canUpdate = usePermission('category:update')

    const categories = data?.categories || []
    const assigned = data?.assigned || []
    const unassigned = data?.unassigned || []
    const coverage = data?.coverage || {}

    const [selectedId, setSelectedId] = useState(null)
    const [expanded, setExpanded] = useState({})
    const [search, setSearch] = useState('')
    const [busy, setBusy] = useState(false)
    const [notice, setNotice] = useState('')
    const [drag, setDrag] = useState(null)

    const iconInput = useRef(null)
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const byId = useMemo(
        () => new Map(categories.map(category => [category.id, category])),
        [categories]
    )
    const tree = useMemo(() => buildTree(categories), [categories])
    const assignedCounts = useMemo(() => {
        const counts = new Map()
        for (const entry of assigned)
            counts.set(entry.categoryId, (counts.get(entry.categoryId) || 0) + 1)
        return counts
    }, [assigned])

    const selected = selectedId ? byId.get(selectedId) : null
    const selectedAssigned = assigned.filter(entry => entry.categoryId === selectedId)
    const filteredUnassigned = unassigned.filter(entry => {
        const query = search.trim().toLowerCase()
        if (!query) return true
        return String(entry.code).toLowerCase().includes(query) ||
            String(entry.subGroup || '').toLowerCase().includes(query) ||
            String(entry.oldPath || '').toLowerCase().includes(query)
    })

    useEffect(() => {
        if (selectedId && byId.has(selectedId)) return
        const first = categories.find(category => category.level === 1)
        if (first) setSelectedId(first.id)
    }, [categories, byId, selectedId])

    /** Non-drag edits (icon, active): show progress and reload the tree. */
    async function run(action, successMessage) {
        setBusy(true)
        setNotice('')
        try {
            await action()
            await callReq()
            if (successMessage) setNotice(successMessage)
        } catch (e) {
            setNotice(e?.message || String(e))
        } finally {
            setBusy(false)
        }
    }

    /**
     * Drag & drop updates: apply the change to the tree we already have, then
     * let the server catch up in the background. Nothing shows as loading, the
     * silent refresh only confirms (and repairs) what is already on screen.
     */
    async function optimistic(patch, request) {
        const snapshot = data
        setData({ ...data, ...patch })
        setNotice('')
        try {
            await request()
            await callReq()
        } catch (e) {
            if (snapshot) setData(snapshot)
            setNotice(e?.message || String(e))
        }
    }

    // Sibling-only: the API rejects any orderedIds set that does not share a parent.
    async function reorder(draggedId, targetId) {
        if (!canUpdate) return
        const dragged = byId.get(draggedId)
        const target = byId.get(targetId)
        if (!dragged || !target || dragged.id === target.id) return
        if ((dragged.parentId || null) !== (target.parentId || null)) return

        const siblings = categories
            .filter(category => (category.parentId || null) === (target.parentId || null))
            .sort(sortSiblings)
        const from = siblings.findIndex(category => category.id === draggedId)
        const to = siblings.findIndex(category => category.id === targetId)
        if (from < 0 || to < 0) return

        const ordered = arrayMove(siblings, from, to)
        const order = new Map(ordered.map((category, index) => [category.id, index]))

        await optimistic(
            { categories: categories.map(category =>
                order.has(category.id) ? { ...category, sortOrder: order.get(category.id) } : category) },
            () => apiReq('category/reorder', {
                parentId: target.parentId || null,
                orderedIds: ordered.map(category => category.id)
            })
        )
    }

    async function assign(code, categoryId) {
        if (!canUpdate) return
        const entry = [...assigned, ...unassigned].find(item => item.code === code)
        const products = entry?.productCount || 0
        const moved = { ...entry, categoryId: categoryId || null }

        await optimistic(
            {
                assigned: categoryId
                    ? [...assigned.filter(item => item.code !== code), moved]
                    : assigned.filter(item => item.code !== code),
                unassigned: categoryId
                    ? unassigned.filter(item => item.code !== code)
                    : [...unassigned, moved],
                coverage: {
                    ...coverage,
                    mappedSubGroups: (coverage.mappedSubGroups ?? 0) + (categoryId ? 1 : -1),
                    unassignedSubGroups: (coverage.unassignedSubGroups ?? 0) + (categoryId ? -1 : 1),
                    unassignedProducts: (coverage.unassignedProducts ?? 0) + (categoryId ? -products : products)
                }
            },
            () => apiReq('category/map/assign', { subGroupCode: code, categoryId })
        )
    }

    async function removeIcon() {
        if (!selected || !canUpdate) return
        await run(() => apiReq('category/update', { id: selected.id, icon: '' }), 'האייקון הוסר')
    }

    async function uploadIcon(event) {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file || !selected || !canUpdate) return
        if (!ICON_EXTENSIONS.test(file.name)) {
            setNotice('יש להעלות קובץ PNG / JPG / WebP (הקובץ מומר אוטומטית ל-WebP)')
            return
        }
        if (file.size > MAX_ICON_BYTES) {
            setNotice(`הקובץ גדול מדי (מקסימום ${Math.floor(MAX_ICON_BYTES / 1024)}KB)`)
            return
        }
        await run(async () => {
            const fileBase64 = await readFileAsDataUrl(file)
            return apiReq('category/upload_icon', { id: selected.id, fileBase64 })
        }, 'האייקון הועלה')
    }

    async function toggleActive(active) {
        if (!selected || !canUpdate) return
        await run(() => apiReq('category/update', { id: selected.id, active }), 'הסטטוס נשמר')
    }

    function openImport() {
        openModal(
            <ImportModal
                onClose={closeModal}
                onDone={async summary => {
                    closeModal()
                    await callReq()
                    setNotice(`הייבוא הושלם: ${summary.categories} קטגוריות, ${summary.map} תתי קבוצות`)
                }}
            />,
            { title: 'העלאת קובץ קטגוריות' }
        )
    }

    /** The node a category drop is allowed to land on (see siblingTarget.js). */
    function dropTargetFor(draggedId, overId) {
        return siblingTargetFor(byId.get(draggedId), overId, byId)
    }

    function onDragStart(event) {
        const data = event.active.data.current || {}
        setDrag(data.subGroupCode
            ? { kind: 'subgroup', label: data.label }
            : { kind: 'category', label: byId.get(event.active.id)?.name || String(event.active.id) })
    }

    function onDragOver(event) {
        if (drag?.kind !== 'category') return
        const dropId = dropTargetFor(event.active.id, event.over?.id)
        if (dropId !== drag.dropId) setDrag(current => current && { ...current, dropId })
    }

    function onDragEnd(event) {
        const { active, over } = event
        setDrag(null)
        if (!over || !canUpdate) return

        const data = active.data.current || {}
        if (data.subGroupCode) {
            const categoryId = over.data.current?.categoryId
            if (!categoryId || categoryId === data.categoryId) return
            assign(data.subGroupCode, categoryId)
            return
        }
        reorder(active.id, dropTargetFor(active.id, over.id))
    }

    function toggleExpanded(id) {
        setExpanded(current => ({ ...current, [id]: current[id] === false }))
    }

    function renderTree(nodes, depth = 0) {
        return <SortableContext
            items={nodes.map(node => node.id)}
            strategy={verticalListSortingStrategy}
        >
            {nodes.map(node => {
                const hasChildren = node.children?.length > 0
                const open = expanded[node.id] !== false

                return <div key={node.id}>
                    <CategoryRow
                        node={node}
                        depth={depth}
                        open={open}
                        count={assignedCounts.get(node.id) || 0}
                        selected={selectedId === node.id}
                        drag={drag}
                        canUpdate={canUpdate}
                        onSelect={setSelectedId}
                        onToggle={toggleExpanded}
                    />
                    {hasChildren && open && <div>{renderTree(node.children, depth + 1)}</div>}
                </div>
            })}
        </SortableContext>
    }

    return <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDrag(null)}
    >
        <Flex col gap={10} className={styles.page}>
            <Flex justifyContent='space-between' alignItems='center' className={styles.header}>
                <div>
                    <Text bold size='h2'>תפריט וקטגוריות</Text>
                    <Text size='s' mode='sub'>
                        גררו את ידית הגרירה של קטגוריה כדי לשנות סדר בין אחים,
                        או גררו תת קבוצה אל קטגוריה כדי לשייך אותה.
                    </Text>
                </div>
                <Button icon='upload' onClick={openImport} disabled={busy} permission='category:update'>
                    העלאת CSV
                </Button>
            </Flex>

            {notice && <Text className={styles.notice}>{notice}</Text>}

            <Flex gap={10} className={styles.body}>
                <Card className={styles.treePanel}>
                    <div className={styles.coverage}>
                        <Text size='s'>מוצרים פעילים: <b>{coverage.activeProducts ?? 0}</b></Text>
                        <Text size='s'>תתי קבוצות פעילות: <b>{coverage.activeSubGroups ?? 0}</b></Text>
                        <Text
                            size='s'
                            mode={coverage.unassignedSubGroups ? 'error' : undefined}
                        >
                            לא משויכות: <b>{coverage.unassignedSubGroups ?? 0}</b>
                            {coverage.unassignedProducts ? ` (${coverage.unassignedProducts} מוצרים)` : ''}
                        </Text>
                        {coverage.noCodeProducts > 0 && (
                            <Text size='s' mode='error'>
                                מוצרים ללא קוד תת קבוצה: <b>{coverage.noCodeProducts}</b>
                            </Text>
                        )}
                    </div>

                    {!data && loading
                        ? <Text>טוען קטגוריות...</Text>
                        : error
                            ? <Text mode='error'>{error?.message || String(error)}</Text>
                            : tree.length === 0
                                ? <Text mode='sub'>אין קטגוריות. העלו קובץ CSV כדי להתחיל.</Text>
                                : <div className={styles.tree}>{renderTree(tree)}</div>}
                </Card>

                <Card className={styles.detailPanel}>
                    {!selected
                        ? <Text mode='sub'>בחרו קטגוריה מהעץ כדי לנהל את תתי הקבוצות שלה.</Text>
                        : <>
                            <Flex justifyContent='space-between' alignItems='start' gap={10}>
                                <div>
                                    <Text bold size='h3'>{selected.name}</Text>
                                    <Text size='s' mode='sub'>
                                        {selected.path} · רמה {selected.level} · קוד {selected.code}
                                    </Text>
                                </div>
                                <Checkbox
                                    checked={selected.active !== false}
                                    disabled={busy || !canUpdate}
                                    onChange={event => toggleActive(event.target.checked)}
                                >
                                    פעיל
                                </Checkbox>
                            </Flex>

                            {selected.level === 1 && <Flex gap={8} alignItems='center' className={styles.iconRow}>
                                <CategoryIcon icon={selected.icon} fallback={false} className={styles.selectedIcon} />
                                <input
                                    ref={iconInput}
                                    type='file'
                                    accept={ICON_ACCEPT}
                                    className={styles.fileInput}
                                    onChange={uploadIcon}
                                />
                                <Button
                                    icon='image'
                                    mode='text'
                                    onClick={() => iconInput.current?.click()}
                                    disabled={busy || !canUpdate}
                                    permission='category:update'
                                >
                                    העלאת אייקון
                                </Button>
                                {selected.icon && <Button
                                    icon='trash'
                                    mode='text'
                                    onClick={removeIcon}
                                    disabled={busy || !canUpdate}
                                    permission='category:update'
                                >
                                    הסרת אייקון
                                </Button>}
                                <Text size='s' mode='sub'>
                                    PNG / JPG / WebP, לפחות 64x64, עד 1024x1024. נשמר כ-WebP.
                                </Text>
                            </Flex>}

                            <div className={styles.section}>
                                <Text bold>תתי קבוצות משויכות ({selectedAssigned.length})</Text>
                                {selectedAssigned.length === 0
                                    ? <Text size='s' mode='sub'>אין תתי קבוצות משויכות לקטגוריה זו.</Text>
                                    : <div className={styles.subGroupList}>
                                        {selectedAssigned.map(entry => <SubGroupRow
                                            key={entry.code}
                                            entry={entry}
                                            isAssigned
                                            canUpdate={canUpdate}
                                            selectedId={selectedId}
                                            onAssign={assign}
                                        />)}
                                    </div>}
                            </div>

                            <div className={styles.section}>
                                <Text bold>תתי קבוצות ללא שיוך ({unassigned.length})</Text>
                                <Text size='s' mode='sub'>
                                    גררו תת קבוצה אל קטגוריה בעץ, או הוסיפו אותה לקטגוריה הנבחרת.
                                </Text>
                                <input
                                    className={styles.search}
                                    placeholder='חיפוש לפי קוד, שם או היררכיה...'
                                    value={search}
                                    onChange={event => setSearch(event.target.value)}
                                />
                                {filteredUnassigned.length === 0
                                    ? <Text size='s' mode='sub'>אין תתי קבוצות מתאימות.</Text>
                                    : <div className={styles.subGroupList}>
                                        {filteredUnassigned.slice(0, 100).map(entry => <SubGroupRow
                                            key={entry.code}
                                            entry={entry}
                                            canUpdate={canUpdate}
                                            selectedId={selectedId}
                                            onAssign={assign}
                                        />)}
                                    </div>}
                            </div>
                        </>}
                </Card>
            </Flex>
        </Flex>

        <DragOverlay dropAnimation={null}>
            {drag ? <span className={styles.dragOverlay}>{drag.label}</span> : null}
        </DragOverlay>
    </DndContext>
}

function ImportModal({ onDone, onClose }) {
    const [file, setFile] = useState(null)
    const [state, setState] = useState()

    async function submit(event) {
        event.preventDefault()
        if (!file) return
        setState({ loading: true })
        try {
            const csvBase64 = await readFileAsDataUrl(file)
            const summary = await apiReq('category/import', { csvBase64, filename: file.name })
            await onDone(summary)
        } catch (e) {
            setState({ error: e })
        }
    }

    return <form className={styles.importForm} onSubmit={submit}>
        <Text>
            הקובץ יחליף את <b>כל</b> עץ הקטגוריות ואת כל שיוכי תתי הקבוצות.
            הפעולה אינה ניתנת לביטול.
        </Text>
        <input
            type='file'
            accept='.csv,text/csv'
            onChange={event => setFile(event.target.files?.[0] || null)}
        />
        {state?.error && <Text mode='error'>{state.error?.message || String(state.error)}</Text>}
        <Flex gap={8} justifyContent='end'>
            <Button mode='text' onClick={onClose} disabled={state?.loading}>ביטול</Button>
            <Button type='submit' icon='upload' loading={state?.loading} disabled={!file}>
                החלפת הכול
            </Button>
        </Flex>
    </form>
}
