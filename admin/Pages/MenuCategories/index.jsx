import { useEffect, useMemo, useState } from 'react'
import useApi from 'common/functions/useApi'
import apiReq from 'common/functions/apiReq'
import Button from 'common/components/Button'
import Card from 'common/components/Card'
import Checkbox from 'common/components/Checkbox'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Icon, { iconNames } from 'common/components/Icon'
import { useModal } from 'common/components/Modal'
import usePermission from 'common/permissions/usePermision'
import classNames from 'common/functions/classNames'
import styles from './menuCategories.module.css'

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

export default function MenuCategories() {
    const { data, loading, error, callReq } = useApi('category/tree')
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

    const [dragCategoryId, setDragCategoryId] = useState(null)
    const [dropCategoryId, setDropCategoryId] = useState(null)
    const [dropNodeId, setDropNodeId] = useState(null)

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

        const next = [...siblings]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)

        await run(
            () => apiReq('category/reorder', {
                parentId: target.parentId || null,
                orderedIds: next.map(category => category.id)
            }),
            'הסדר נשמר'
        )
    }

    async function assign(code, categoryId) {
        if (!canUpdate) return
        await run(
            () => apiReq('category/map/assign', { subGroupCode: code, categoryId }),
            categoryId ? 'תת הקבוצה שויכה' : 'השיוך הוסר'
        )
    }

    async function setIcon(icon) {
        if (!selected || !canUpdate) return
        await run(() => apiReq('category/update', { id: selected.id, icon }), 'האייקון נשמר')
    }

    async function toggleActive(active) {
        if (!selected || !canUpdate) return
        await run(() => apiReq('category/update', { id: selected.id, active }), 'הסטטוס נשמר')
    }

    function openIconPicker() {
        if (!selected) return
        openModal(
            <IconPicker
                current={selected.icon}
                onPick={async icon => {
                    closeModal()
                    await setIcon(icon)
                }}
                onClose={closeModal}
            />,
            { title: 'בחירת אייקון' }
        )
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

    function onCategoryDragStart(event, category) {
        event.stopPropagation()
        event.dataTransfer.setData('application/x-category', category.id)
        event.dataTransfer.effectAllowed = 'move'
        setDragCategoryId(category.id)
    }

    function onDragOver(event, node) {
        const types = event.dataTransfer.types
        if (types.includes('application/x-subgroup')) {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'link'
            setDropNodeId(node.id)
            return
        }
        if (types.includes('application/x-category') && dragCategoryId) {
            const dragged = byId.get(dragCategoryId)
            if (dragged && dragged.id !== node.id &&
                (dragged.parentId || null) === (node.parentId || null)) {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDropCategoryId(node.id)
            }
        }
    }

    function onDragLeave(node) {
        setDropCategoryId(current => current === node.id ? null : current)
        setDropNodeId(current => current === node.id ? null : current)
    }

    function onDrop(event, node) {
        const code = event.dataTransfer.getData('application/x-subgroup')
        if (code) {
            event.preventDefault()
            setDropNodeId(null)
            assign(code, node.id)
            return
        }
        const categoryId = event.dataTransfer.getData('application/x-category')
        if (categoryId) {
            event.preventDefault()
            setDropCategoryId(null)
            setDragCategoryId(null)
            reorder(categoryId, node.id)
        }
    }

    function onDragEnd() {
        setDragCategoryId(null)
        setDropCategoryId(null)
        setDropNodeId(null)
    }

    function toggleExpanded(id) {
        setExpanded(current => ({ ...current, [id]: current[id] === false }))
    }

    function renderSubGroup(entry, isAssigned) {
        return <div
            key={entry.code}
            className={styles.subGroup}
            draggable={canUpdate}
            onDragStart={event => {
                event.dataTransfer.setData('application/x-subgroup', entry.code)
                event.dataTransfer.effectAllowed = 'link'
            }}
        >
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
                    disabled={busy}
                    onClick={() => assign(entry.code, null)}
                />
                : <Button
                    icon='add'
                    mode='text'
                    tooltip='שיוך לקטגוריה הנבחרת'
                    permission='category:update'
                    disabled={busy || !selectedId}
                    onClick={() => assign(entry.code, selectedId)}
                />}
        </div>
    }

    function renderTree(nodes, depth = 0) {
        return nodes.map(node => {
            const hasChildren = node.children?.length > 0
            const open = expanded[node.id] !== false
            const count = assignedCounts.get(node.id) || 0

            return <div key={node.id}>
                <div
                    className={classNames(
                        styles.node,
                        selectedId === node.id && styles.selected,
                        dropCategoryId === node.id && styles.dropTarget,
                        dropNodeId === node.id && styles.assignTarget,
                        node.active === false && styles.inactive
                    )}
                    style={{ paddingInlineStart: `${depth * 14 + 4}px` }}
                    onClick={() => setSelectedId(node.id)}
                    draggable={canUpdate}
                    onDragStart={event => onCategoryDragStart(event, node)}
                    onDragOver={event => onDragOver(event, node)}
                    onDragLeave={() => onDragLeave(node)}
                    onDrop={event => onDrop(event, node)}
                    onDragEnd={onDragEnd}
                >
                    {hasChildren
                        ? <button
                            type='button'
                            className={styles.chevron}
                            onClick={event => {
                                event.stopPropagation()
                                toggleExpanded(node.id)
                            }}
                        >
                            <Icon
                                name='left'
                                className={classNames(styles.chevronIcon, [styles.chevronOpen, open])}
                            />
                        </button>
                        : <span className={styles.chevronPlaceholder} />}

                    {node.icon ? <Icon name={node.icon} className={styles.nodeIcon} /> : null}
                    <span className={styles.nodeName}>{node.name}</span>
                    <span className={styles.levelTag}>L{node.level}</span>
                    {count ? <span className={styles.badge}>{count}</span> : null}
                    {node.active === false ? <span className={styles.inactiveTag}>כבוי</span> : null}
                </div>

                {hasChildren && open && <div>{renderTree(node.children, depth + 1)}</div>}
            </div>
        })
    }

    return <Flex col gap={10} className={styles.page}>
        <Flex justifyContent='space-between' alignItems='center' className={styles.header}>
            <div>
                <Text bold size='h2'>תפריט וקטגוריות</Text>
                <Text size='s' mode='sub'>
                    גררו קטגוריה כדי לשנות סדר בין אחים, או גררו תת קבוצה על קטגוריה כדי לשייך אותה.
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

                {loading
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

                        {selected.level === 1 && (
                            <Flex gap={6} alignItems='center' className={styles.iconRow}>
                                <Icon name={selected.icon} fallback className={styles.selectedIcon} />
                                <Button
                                    icon='image'
                                    mode='text'
                                    onClick={openIconPicker}
                                    disabled={busy}
                                    permission='category:update'
                                >
                                    בחירת אייקון
                                </Button>
                                {selected.icon && (
                                    <Button
                                        icon='x'
                                        mode='text'
                                        onClick={() => setIcon('')}
                                        disabled={busy}
                                        permission='category:update'
                                    >
                                        הסרת אייקון
                                    </Button>
                                )}
                            </Flex>
                        )}

                        <div className={styles.section}>
                            <Text bold>תתי קבוצות משויכות ({selectedAssigned.length})</Text>
                            {selectedAssigned.length === 0
                                ? <Text size='s' mode='sub'>אין תתי קבוצות משויכות לקטגוריה זו.</Text>
                                : <div className={styles.subGroupList}>
                                    {selectedAssigned.map(entry => renderSubGroup(entry, true))}
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
                                    {filteredUnassigned.slice(0, 100).map(entry => renderSubGroup(entry, false))}
                                </div>}
                        </div>
                    </>}
            </Card>
        </Flex>
    </Flex>
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

function IconPicker({ current, onPick, onClose }) {
    const [query, setQuery] = useState('')
    const filtered = iconNames.filter(name =>
        !query.trim() || name.toLowerCase().includes(query.trim().toLowerCase())
    )

    return <div className={styles.iconPicker}>
        <input
            className={styles.search}
            placeholder='חיפוש אייקון...'
            value={query}
            onChange={event => setQuery(event.target.value)}
            autoFocus
        />
        <div className={styles.iconGrid}>
            {filtered.map(name => <button
                key={name}
                type='button'
                className={classNames(styles.iconOption, name === current && styles.iconSelected)}
                onClick={() => onPick(name)}
            >
                <Icon name={name} />
                <span>{name}</span>
            </button>)}
        </div>
        <Flex gap={8} justifyContent='end'>
            <Button mode='text' onClick={() => onPick('')}>הסרת אייקון</Button>
            <Button mode='text' onClick={onClose}>סגירה</Button>
        </Flex>
    </div>
}
