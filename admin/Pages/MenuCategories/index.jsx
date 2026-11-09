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
import { useText } from 'common/texts/TextProvider'
import { FLAGS_HEADER } from 'common/constants/categoryFlags.js'
import { buildFlagsTemplate } from 'common/functions/buildFlagsTemplate.js'
import usePermission from 'common/permissions/usePermision'
import classNames from 'common/functions/classNames'
import { siblingTargetFor } from './siblingTarget.js'
import SubGroupProductsModal from './SubGroupProductsModal.jsx'
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

function downloadCsvFile(filename, csv) {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
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

function CategoryRow({ node, depth, open, count, flags, selected, canUpdate, onSelect, onToggle }) {
    const { TR } = useText()
    const {
        attributes, listeners, setNodeRef, setActivatorNodeRef,
        transform, transition, isDragging
    } = useSortable({
        id: node.id,
        disabled: !canUpdate,
        data: { categoryId: node.id }
    })

    const hasChildren = node.children?.length > 0

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
            node.active === false && styles.inactive
        )}
        onClick={() => onSelect(node.id)}
    >
        {canUpdate && <DragHandle
            innerRef={setActivatorNodeRef}
            attributes={attributes}
            listeners={listeners}
            label={TR('menu_categories_drag_category')}
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
        {flags?.hidden ? <span
            className={classNames(styles.flagTag, styles.flagHidden)}
            title={TR('menu_categories_flag_hidden_count', { count: flags.hidden })}
        >
            <Icon name='x' className={styles.flagIcon} />{flags.hidden}
        </span> : null}
        {flags?.kashrut ? <span
            className={classNames(styles.flagTag, styles.flagKashrut)}
            title={TR('menu_categories_flag_kashrut_count', { count: flags.kashrut })}
        >
            <Icon name='shield' className={styles.flagIcon} />{flags.kashrut}
        </span> : null}
        {count ? <span className={styles.badge}>{count}</span> : null}
        {node.active === false
            ? <span className={styles.inactiveTag}>{TR('menu_categories_inactive_tag')}</span>
            : null}
    </div>
}

function SubGroupRow({ entry, isAssigned, canUpdate, selectedId, onAssign, onPreview }) {
    const { TR } = useText()
    const label = entry.subGroup || TR('menu_categories_subgroup_code', { code: entry.code })
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
        id: `${SUB_GROUP_PREFIX}${entry.code}`,
        disabled: !canUpdate,
        data: {
            subGroupCode: entry.code,
            categoryId: entry.categoryId || null,
            label
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
            label={TR('menu_categories_drag_subgroup')}
        />}

        <div className={styles.subGroupText}>
            <Text bold>{label}</Text>
            <Text size='s' mode='sub'>
                {entry.oldPath || TR('menu_categories_no_hierarchy')}
            </Text>
        </div>
        <span className={styles.code}>{entry.code}</span>
        {entry.showOnSite === false ? <span className={classNames(styles.flagTag, styles.flagHidden)}>
            {TR('menu_categories_flag_hidden')}
        </span> : null}
        {entry.requireKashrut === true ? <span className={classNames(styles.flagTag, styles.flagKashrut)}>
            {TR('menu_categories_flag_kashrut')}
        </span> : null}
        <span className={styles.badge}>{entry.productCount}</span>
        <Button
            icon='products'
            mode='text'
            tooltip={TR('menu_categories_preview_products')}
            onClick={() => onPreview(entry)}
        />
        {isAssigned
            ? <Button
                icon='trash'
                mode='text'
                tooltip={TR('menu_categories_unassign')}
                permission='category:update'
                onClick={() => onAssign(entry.code, null)}
            />
            : <Button
                icon='add'
                mode='text'
                tooltip={TR('menu_categories_assign_selected')}
                permission='category:update'
                disabled={!selectedId}
                onClick={() => onAssign(entry.code, selectedId)}
            />}
    </div>
}

export default function MenuCategories() {
    const { data, loading, error, callReq, setData } = useApi('category/tree')
    const { openModal, closeModal } = useModal()
    const { TR } = useText()
    const canUpdate = usePermission('category:update')

    const categories = data?.categories || []
    const assigned = data?.assigned || []
    const unassigned = data?.unassigned || []
    const coverage = data?.coverage || {}

    const [selectedId, setSelectedId] = useState(null)
    // Collapsed by default: only the ids in this set are open.
    const [expanded, setExpanded] = useState(() => new Set())
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
    // Roll flagged sub-groups up to their ancestors, so a category shows the
    // flags of every sub-group below it, not only the ones assigned directly.
    const flagCounts = useMemo(() => {
        const counts = new Map()
        const add = (categoryId, key) => {
            const seen = new Set()
            let id = categoryId
            while (id && !seen.has(id)) {
                seen.add(id)
                const entry = counts.get(id) || { hidden: 0, kashrut: 0 }
                entry[key] += 1
                counts.set(id, entry)
                id = byId.get(id)?.parentId || null
            }
        }
        for (const entry of assigned) {
            if (entry.showOnSite === false) add(entry.categoryId, 'hidden')
            if (entry.requireKashrut === true) add(entry.categoryId, 'kashrut')
        }
        return counts
    }, [assigned, byId])

    const selected = selectedId ? byId.get(selectedId) : null
    const selectedAssigned = assigned.filter(entry => entry.categoryId === selectedId)
    const selectedFlags = selectedId ? flagCounts.get(selectedId) : null
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
        await run(
            () => apiReq('category/update', { id: selected.id, icon: '' }),
            TR('menu_categories_icon_removed')
        )
    }

    async function uploadIcon(event) {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file || !selected || !canUpdate) return
        if (!ICON_EXTENSIONS.test(file.name)) {
            setNotice(TR('menu_categories_icon_invalid'))
            return
        }
        if (file.size > MAX_ICON_BYTES) {
            setNotice(TR('menu_categories_icon_too_large', {
                max: Math.floor(MAX_ICON_BYTES / 1024)
            }))
            return
        }
        await run(async () => {
            const fileBase64 = await readFileAsDataUrl(file)
            return apiReq('category/upload_icon', { id: selected.id, fileBase64 })
        }, TR('menu_categories_icon_uploaded'))
    }

    async function toggleActive(active) {
        if (!selected || !canUpdate) return
        await run(
            () => apiReq('category/update', { id: selected.id, active }),
            TR('menu_categories_status_saved')
        )
    }

    function openImport() {
        openModal(
            <ImportModal
                onClose={closeModal}
                onDone={async summary => {
                    closeModal()
                    await callReq()
                    setNotice(TR('menu_categories_import_done', {
                        categories: summary.categories,
                        map: summary.map
                    }))
                }}
            />,
            { title: TR('menu_categories_import_title') }
        )
    }

    // The flags file is separate from the tree file: it only updates the
    // show/hide + kashrut flags of existing sub-groups.
    function openFlagsImport() {
        openModal(
            <FlagImportModal
                onClose={closeModal}
                onDone={async summary => {
                    closeModal()
                    await callReq()
                    setNotice(
                        TR('menu_categories_flags_done', {
                            written: summary.written,
                            unchanged: summary.unchanged,
                            hidden: summary.hidden,
                            unhidden: summary.unhidden
                        }) +
                        (summary.unknown
                            ? TR('menu_categories_flags_unknown', { count: summary.unknown })
                            : '')
                    )
                }}
            />,
            { title: TR('menu_categories_flags_title') }
        )
    }

    // Renaming rewrites the slug, every path under the category and the titles
    // stored on its products, so the tree is refetched rather than patched.
    async function afterRename(result) {
        setBusy(true)
        try {
            await callReq()
            setNotice(TR('menu_categories_rename_done', {
                path: result?.path || '',
                categories: result?.categories ?? 0,
                products: result?.products ?? 0
            }))
        } finally {
            setBusy(false)
        }
    }

    /** What a mapping covers: the active products sitting on that sub-group. */
    function openProducts(entry) {
        openModal(
            <SubGroupProductsModal entry={entry} onClose={closeModal} />,
            { title: [entry.subGroup, entry.code].filter(Boolean).join(' - ') }
        )
    }

    /** The node a category drop is allowed to land on (see siblingTarget.js). */
    function dropTargetFor(draggedId, overId) {
        return siblingTargetFor(byId.get(draggedId), overId, byId)
    }

    function siblingIndex(parentId) {
        return categories
            .filter(category => (category.parentId || null) === (parentId || null))
            .sort(sortSiblings)
            .map(category => category.id)
    }

    function onDragStart(event) {
        const data = event.active.data.current || {}
        // `initial` is the source rect before any transform, i.e. the row the
        // clone is standing in: give the clone the same width so the label
        // has exactly as much room as it had in the tree.
        const width = event.active.rect.current.initial?.width || 0

        setDrag(data.subGroupCode
            ? { kind: 'subgroup', label: data.label, code: data.subGroupCode, width }
            : {
                kind: 'category',
                id: String(event.active.id),
                label: byId.get(event.active.id)?.name || String(event.active.id),
                width,
                depth: siblingIndex(byId.get(event.active.id)?.parentId).indexOf(String(event.active.id))
            })
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
        setExpanded(current => {
            const next = new Set(current)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const expandAll = () => setExpanded(new Set(categories.map(category => category.id)))
    const collapseAll = () => setExpanded(new Set())

    function renderTree(nodes, depth = 0) {
        return <SortableContext
            items={nodes.map(node => node.id)}
            strategy={verticalListSortingStrategy}
        >
            {nodes.map(node => {
                const hasChildren = node.children?.length > 0
                const open = expanded.has(node.id)

                return <div key={node.id}>
                    <CategoryRow
                        node={node}
                        depth={depth}
                        open={open}
                        count={assignedCounts.get(node.id) || 0}
                        flags={flagCounts.get(node.id)}
                        selected={selectedId === node.id}
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
        onDragEnd={onDragEnd}
        onDragCancel={() => setDrag(null)}
    >
        <Flex col gap={10} className={classNames(styles.page, drag && styles.isDragging)}>
            <Flex justifyContent='space-between' alignItems='center' className={styles.header}>
                <div>
                    <Text bold size='h2'>{TR('menu_categories_nav')}</Text>
                    <Text size='s' mode='sub'>{TR('menu_categories_hint')}</Text>
                </div>
                <Flex gap={8}>
                    <Button icon='upload' onClick={openImport} disabled={busy} permission='category:update'>
                        {TR('menu_categories_import')}
                    </Button>
                    <Button icon='shield' onClick={openFlagsImport} disabled={busy} permission='category:update'>
                        {TR('menu_categories_flags_import')}
                    </Button>
                </Flex>
            </Flex>

            {notice && <Text className={styles.notice}>{notice}</Text>}

            <Flex gap={10} className={styles.body}>
                <Card className={styles.treePanel}>
                    <Flex justifyContent='space-between' alignItems='center' className={styles.treeToolbar}>
                        <Text size='s' mode='sub'>
                            {TR('menu_categories_tree_counts', {
                                categories: categories.length,
                                open: expanded.size
                            })}
                        </Text>
                        <Flex gap={6}>
                            <Button
                                icon='expand'
                                mode='text'
                                tooltip={TR('menu_categories_expand_all_tooltip')}
                                onClick={expandAll}
                                disabled={tree.length === 0}
                            >
                                {TR('menu_categories_expand_all')}
                            </Button>
                            <Button
                                icon='collapse'
                                mode='text'
                                tooltip={TR('menu_categories_collapse_all_tooltip')}
                                onClick={collapseAll}
                                disabled={expanded.size === 0}
                            >
                                {TR('menu_categories_collapse_all')}
                            </Button>
                        </Flex>
                    </Flex>

                    <div className={styles.coverage}>
                        <Text size='s'>
                            {TR('menu_categories_active_products')} <b>{coverage.activeProducts ?? 0}</b>
                        </Text>
                        <Text size='s'>
                            {TR('menu_categories_active_subgroups')} <b>{coverage.activeSubGroups ?? 0}</b>
                        </Text>
                        <Text
                            size='s'
                            mode={coverage.unassignedSubGroups ? 'error' : undefined}
                        >
                            {TR('menu_categories_unassigned')} <b>{coverage.unassignedSubGroups ?? 0}</b>
                            {coverage.unassignedProducts
                                ? TR('menu_categories_unassigned_products', {
                                    count: coverage.unassignedProducts
                                })
                                : ''}
                        </Text>
                        {coverage.noCodeProducts > 0 && (
                            <Text size='s' mode='error'>
                                {TR('menu_categories_no_code_products')} <b>{coverage.noCodeProducts}</b>
                            </Text>
                        )}
                    </div>

                    {!data && loading
                        ? <Text>{TR('menu_categories_loading')}</Text>
                        : error
                            ? <Text mode='error'>{error?.message || String(error)}</Text>
                            : tree.length === 0
                                ? <Text mode='sub'>{TR('menu_categories_empty')}</Text>
                                : <div className={styles.tree}>{renderTree(tree)}</div>}
                </Card>

                <Card className={styles.detailPanel}>
                    {!selected
                        ? <Text mode='sub'>{TR('menu_categories_select_hint')}</Text>
                        : <>
                            <Flex justifyContent='space-between' alignItems='start' gap={10}>
                                <div>
                                    {canUpdate
                                        ? <CategoryTitle
                                            key={selected.id}
                                            category={selected}
                                            onDone={afterRename}
                                        />
                                        : <Text bold size='h3'>{selected.name}</Text>}
                                    <Text size='s' mode='sub'>
                                        {TR('menu_categories_meta', {
                                            path: selected.path,
                                            level: selected.level,
                                            code: selected.code
                                        })}
                                    </Text>
                                    {selectedFlags && (selectedFlags.hidden || selectedFlags.kashrut)
                                        ? <Flex gap={6} className={styles.flagRow}>
                                            {selectedFlags.hidden ? <span
                                                className={classNames(styles.flagTag, styles.flagHidden)}
                                            >
                                                {TR('menu_categories_flag_hidden_count', {
                                                    count: selectedFlags.hidden
                                                })}
                                            </span> : null}
                                            {selectedFlags.kashrut ? <span
                                                className={classNames(styles.flagTag, styles.flagKashrut)}
                                            >
                                                {TR('menu_categories_flag_kashrut_count', {
                                                    count: selectedFlags.kashrut
                                                })}
                                            </span> : null}
                                        </Flex>
                                        : null}
                                </div>
                                <Checkbox
                                    checked={selected.active !== false}
                                    disabled={busy || !canUpdate}
                                    onChange={event => toggleActive(event.target.checked)}
                                >
                                    {TR('active')}
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
                                    {TR('menu_categories_upload_icon')}
                                </Button>
                                {selected.icon && <Button
                                    icon='trash'
                                    mode='text'
                                    onClick={removeIcon}
                                    disabled={busy || !canUpdate}
                                    permission='category:update'
                                >
                                    {TR('menu_categories_remove_icon')}
                                </Button>}
                                <Text size='s' mode='sub'>
                                    {TR('menu_categories_icon_hint')}
                                </Text>
                            </Flex>}

                            <div className={styles.section}>
                                <Text bold>
                                    {TR('menu_categories_assigned_title', {
                                        count: selectedAssigned.length
                                    })}
                                </Text>
                                {selectedAssigned.length === 0
                                    ? <Text size='s' mode='sub'>{TR('menu_categories_assigned_empty')}</Text>
                                    : <div className={styles.subGroupList}>
                                        {selectedAssigned.map(entry => <SubGroupRow
                                            key={entry.code}
                                            entry={entry}
                                            isAssigned
                                            canUpdate={canUpdate}
                                            selectedId={selectedId}
                                            onAssign={assign}
                                            onPreview={openProducts}
                                        />)}
                                    </div>}
                            </div>

                            <div className={styles.section}>
                                <Text bold>
                                    {TR('menu_categories_unassigned_title', {
                                        count: unassigned.length
                                    })}
                                </Text>
                                <Text size='s' mode='sub'>{TR('menu_categories_unassigned_hint')}</Text>
                                <input
                                    className={styles.search}
                                    placeholder={TR('menu_categories_search_placeholder')}
                                    value={search}
                                    onChange={event => setSearch(event.target.value)}
                                />
                                {filteredUnassigned.length === 0
                                    ? <Text size='s' mode='sub'>{TR('menu_categories_no_matches')}</Text>
                                    : <div className={styles.subGroupList}>
                                        {filteredUnassigned.slice(0, 100).map(entry => <SubGroupRow
                                            key={entry.code}
                                            entry={entry}
                                            canUpdate={canUpdate}
                                            selectedId={selectedId}
                                            onAssign={assign}
                                            onPreview={openProducts}
                                        />)}
                                    </div>}
                            </div>
                        </>}
                </Card>
            </Flex>
        </Flex>

        <DragOverlay dropAnimation={null}>
            {drag?.kind === 'category' && byId.get(drag.id)
                ? <div
                    className={styles.dragOverlayCat}
                    style={{
                        paddingInlineStart: `${drag.depth * 14 + 4}px`,
                        minWidth: drag.width ? `${drag.width}px` : undefined
                    }}
                >
                    <CategoryIcon icon={byId.get(drag.id).icon} fallback={false} className={styles.nodeIcon} />
                    <span className={styles.nodeName}>{byId.get(drag.id).name}</span>
                    <span className={styles.levelTag}>L{byId.get(drag.id).level}</span>
                </div>
                : drag?.kind === 'subgroup'
                    ? <span
                        className={styles.dragOverlay}
                        style={{ minWidth: drag.width ? `${drag.width}px` : undefined }}
                    >
                        {drag.label}
                        <span className={styles.code}>{drag.code}</span>
                    </span>
                    : null}
        </DragOverlay>
    </DndContext>
}

/**
 * Category title with an inline rename: the pencil replaces the title with an
 * input in place. Enter saves, Escape cancels.
 *
 * The server recomputes the slug, the paths of every category below it and the
 * titles stored on its products; the id never changes, so the CSV export and
 * the sub-group map keep working.
 */
function CategoryTitle({ category, onDone }) {
    const { TR } = useText()
    const [editing, setEditing] = useState(false)
    const [name, setName] = useState(category.name)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const trimmed = name.trim()
    const dirty = trimmed !== category.name && trimmed.length >= 2

    const start = () => {
        setName(category.name)
        setError('')
        setEditing(true)
    }
    const cancel = () => {
        setEditing(false)
        setName(category.name)
        setError('')
    }

    async function save() {
        if (!dirty || saving) return
        setSaving(true)
        setError('')
        try {
            onDone(await apiReq('category/rename', { id: category.id, name: trimmed }))
            cancel()
        } catch (e) {
            setError(e?.message || String(e))
        } finally {
            setSaving(false)
        }
    }

    if (!editing)
        return <Flex alignItems='center' gap={4} className={styles.titleRow}>
            <Text bold size='h3'>{category.name}</Text>
            <Button
                icon='edit'
                mode='text'
                tooltip={TR('menu_categories_rename_tooltip')}
                aria-label={TR('menu_categories_rename_tooltip')}
                onClick={start}
            />
        </Flex>

    return <form className={styles.renameForm} onSubmit={event => { event.preventDefault(); save() }}>
        <input
            className={styles.renameInput}
            value={name}
            maxLength={100}
            autoFocus
            aria-label={TR('menu_categories_rename_aria')}
            onChange={event => setName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Escape') cancel() }}
        />
        <Button
            type='submit'
            icon='check'
            mode='text'
            tooltip={TR('menu_categories_save_name')}
            loading={saving}
            disabled={!dirty}
        />
        <Button mode='text' icon='x' tooltip={TR('cancel')} onClick={cancel} disabled={saving} />
        {error && <Text size='s' mode='error'>{error}</Text>}
    </form>
}

function ImportModal({ onDone, onClose }) {
    const { TR } = useText()
    const [file, setFile] = useState(null)
    const [state, setState] = useState()
    const fileInput = useRef(null)

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

    // The exported file is the same format the upload accepts: download it,
    // edit it, and send it back for bulk reassignment or reordering.
    async function exportCsv() {
        setState(current => ({
            ...current,
            exporting: true,
            exportError: null,
            exportNotice: ''
        }))
        try {
            const exported = await apiReq('category/export')
            downloadCsvFile(exported?.filename || 'category-map.csv', exported?.csv || '')
            setState(current => ({
                ...current,
                exporting: false,
                exportNotice: TR('menu_categories_export_done', {
                    categories: exported?.categories ?? 0,
                    mapped: exported?.mapped ?? 0,
                    unassigned: exported?.unassigned ?? 0
                })
            }))
        } catch (e) {
            setState(current => ({ ...current, exporting: false, exportError: e }))
        }
    }

    return <form className={styles.importForm} onSubmit={submit}>
        <Text>
            {TR('menu_categories_import_warning_before')}{' '}
            <b>{TR('menu_categories_import_warning_all')}</b>{' '}
            {TR('menu_categories_import_warning_after')}
        </Text>
        <input
            ref={fileInput}
            type='file'
            accept='.csv,text/csv'
            className={styles.fileInput}
            onChange={event => {
                setFile(event.target.files?.[0] || null)
                event.target.value = ''
            }}
        />
        <Flex gap={8} alignItems='center' className={styles.filePicker}>
            <Button
                type='button'
                mode='text'
                icon='csv'
                onClick={() => fileInput.current?.click()}
                disabled={state?.exporting}
            >
                {TR('menu_categories_choose_file')}
            </Button>
            <Text size='s' mode={file ? undefined : 'sub'} className={styles.fileName}>
                {file?.name || TR('menu_categories_no_file')}
            </Text>
        </Flex>
        {state?.exportNotice && <Text size='s' mode='sub'>{state.exportNotice}</Text>}
        {state?.exportError && (
            <Text mode='error'>{state.exportError?.message || String(state.exportError)}</Text>
        )}
        {state?.error && <Text mode='error'>{state.error?.message || String(state.error)}</Text>}
        <Flex gap={8} justifyContent='space-between'>
            <Button
                type='button'
                mode='text'
                icon='download'
                loading={state?.exporting}
                disabled={state?.loading}
                onClick={exportCsv}
            >
                {TR('menu_categories_export')}
            </Button>
            <Flex gap={8}>
                <Button
                    type='button'
                    mode='text'
                    onClick={onClose}
                    disabled={state?.loading || state?.exporting}
                >
                    {TR('cancel')}
                </Button>
                <Button
                    type='submit'
                    icon='upload'
                    loading={state?.loading}
                    disabled={!file || state?.exporting}
                >
                    {TR('menu_categories_import_confirm')}
                </Button>
            </Flex>
        </Flex>
    </form>
}

function FlagImportModal({ onDone, onClose }) {
    const { TR } = useText()
    const [file, setFile] = useState(null)
    const [state, setState] = useState()
    const fileInput = useRef(null)

    async function submit(event) {
        event.preventDefault()
        if (!file) return
        setState({ loading: true })
        try {
            const csvBase64 = await readFileAsDataUrl(file)
            const summary = await apiReq('category/import_flags', { csvBase64, filename: file.name })
            await onDone(summary)
        } catch (e) {
            setState({ error: e })
        }
    }

    function downloadTemplate() {
        downloadCsvFile('category-flags-template.csv', buildFlagsTemplate())
    }

    return <form className={styles.importForm} onSubmit={submit}>
        <Text>{TR('menu_categories_flags_hint')}</Text>
        <Text size='s' mode='sub'>{TR('menu_categories_flags_headers')}</Text>
        <div className={styles.headerList}>
            {FLAGS_HEADER.map(name => <span key={name} className={styles.headerChip}>{name}</span>)}
        </div>
        <input
            ref={fileInput}
            type='file'
            accept='.csv,text/csv'
            className={styles.fileInput}
            onChange={event => {
                setFile(event.target.files?.[0] || null)
                event.target.value = ''
            }}
        />
        <Flex gap={8} alignItems='center' className={styles.filePicker}>
            <Button type='button' mode='text' icon='csv' onClick={() => fileInput.current?.click()}>
                {TR('menu_categories_choose_file')}
            </Button>
            <Text size='s' mode={file ? undefined : 'sub'} className={styles.fileName}>
                {file?.name || TR('menu_categories_no_file')}
            </Text>
        </Flex>
        {state?.error && <Text mode='error'>{state.error?.message || String(state.error)}</Text>}
        <Flex gap={8} justifyContent='space-between'>
            <Button type='button' mode='text' icon='download' onClick={downloadTemplate}>
                {TR('menu_categories_flags_template')}
            </Button>
            <Flex gap={8}>
                <Button type='button' mode='text' onClick={onClose} disabled={state?.loading}>
                    {TR('cancel')}
                </Button>
                <Button type='submit' icon='shield' loading={state?.loading} disabled={!file}>
                    {TR('menu_categories_flags_confirm')}
                </Button>
            </Flex>
        </Flex>
    </form>
}
