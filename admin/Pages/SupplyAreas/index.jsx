import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import useApi from 'common/functions/useApi'
import apiReq from 'common/functions/apiReq'
import Button from 'common/components/Button'
import ConfirmButton from 'common/components/ConfirmButton'
import Input from 'common/components/Input'
import Flex from 'common/components/Flex'
import Card from 'common/components/Card'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import { useText } from 'common/texts/TextProvider'
import SupplyAreaMap from './SupplyAreaMap'
import styles from './supplyAreas.module.css'

const toMessage = (err) => (typeof err === 'string' ? err : err?.message || 'something went wrong')

const ISRAEL_BOUNDS = { west: 34.2, south: 29.5, east: 35.9, north: 33.4 }
const MAX_RINGS = 10
function padBounds(bounds, ratio = 0.5) {
    const latSpan = bounds.north - bounds.south
    const lngSpan = bounds.east - bounds.west
    const latPad = latSpan * ratio
    const lngPad = lngSpan * ratio
    return {
        north: Math.min(ISRAEL_BOUNDS.north, bounds.north + latPad),
        south: Math.max(ISRAEL_BOUNDS.south, bounds.south - latPad),
        east: Math.min(ISRAEL_BOUNDS.east, bounds.east + lngPad),
        west: Math.max(ISRAEL_BOUNDS.west, bounds.west - lngPad)
    }
}
function boundsCoversOuter(outer) {
    return outer.north >= ISRAEL_BOUNDS.north && outer.south <= ISRAEL_BOUNDS.south
        && outer.east >= ISRAEL_BOUNDS.east && outer.west <= ISRAEL_BOUNDS.west
}

function mergeById(prev, incoming) {
    const map = new Map(prev.map(a => [a.id, a]))
    let changed = false
    for (const a of incoming) {
        if (!map.has(a.id)) changed = true
        else {
            const prevA = map.get(a.id)
            if (JSON.stringify(prevA) !== JSON.stringify(a)) changed = true
        }
        map.set(a.id, a)
    }
    if (!changed && incoming.length === 0) return prev
    if (map.size === prev.length && !changed) return prev
    return [...map.values()]
}

export default function SupplyAreas() {
    const { TR } = useText()
    const [areas, setAreas] = useState([])
    const [loading, setLoading] = useState(true)
    const [bgLoading, setBgLoading] = useState(false)
    const viewportBoundsRef = useRef(null)
    const bgRunningRef = useRef(false)
    const { data: stores = [] } = useApi('store/read')
    const { data: groups = [], callReq: refetchGroups } = useApi('area_group/read', { limit: 0 })

    // No full collection refetch — mutations patch single ids (see handleGeometryCommit/handleDeleteAreaPopup/handleMapCreated)
    const patchArea = useCallback((updated) => {
        if (!updated?.id) return
        setAreas(prev => {
            const idx = prev.findIndex(a => a.id === updated.id)
            if (idx === -1) return [...prev, updated]
            const next = [...prev]
            next[idx] = updated
            return next
        })
    }, [])
    const removeArea = useCallback((id) => {
        setAreas(prev => prev.filter(a => a.id !== id))
    }, [])

    const viewportFetchedRef = useRef(false)
    const fetchViewport = useCallback(async (bounds) => {
        if (viewportFetchedRef.current) return
        viewportFetchedRef.current = true
        viewportBoundsRef.current = bounds
        try {
            const data = await apiReq('supply_area/read', { bounds, limit: 0, select: { id: 1, name: 1, location: 1, stores: 1 } })
            if (Array.isArray(data)) {
                setAreas(prev => {
                    if (prev.length === 0) return data
                    return mergeById(prev, data)
                })
            }
        } catch (_) {}
        setLoading(false)
    }, [])

    const startBackgroundFetch = useCallback(async () => {
        // return
        if (bgRunningRef.current) return
        bgRunningRef.current = true
        setBgLoading(true)
        try {
            const initial = viewportBoundsRef.current
            if (!initial) return
            let inner = initial
            let outer = padBounds(inner, 0.3)
            for (let ringIdx = 0; ringIdx < MAX_RINGS; ringIdx++) {
                // Stop if outer already covers Israel
                if (boundsCoversOuter(outer) && ringIdx > 0) {
                    // one final ring to catch remainder up to Israel edge
                }
                let skip = 0
                const limit = 200
                while (true) {
                    const page = await apiReq('supply_area/read', { ring: { inner, outer }, skip, limit, select: { id: 1, name: 1, location: 1, stores: 1 } })
                    if (!Array.isArray(page) || page.length === 0) break
                    setAreas(prev => mergeById(prev, page))
                    if (page.length < limit) break
                    skip += limit
                    await new Promise(r => setTimeout(r, 60))
                }
                if (boundsCoversOuter(outer)) break
                // expand for next ring; keep constant pad
                const nextOuter = padBounds(outer, 0.3)
                // if outer didn't grow (already at Israel bounds) stop
                if (nextOuter.north === outer.north && nextOuter.south === outer.south && nextOuter.east === outer.east && nextOuter.west === outer.west) break
                inner = outer
                outer = nextOuter
                await new Promise(r => setTimeout(r, 40))
                // even if ring was empty, continue expanding until Israel covered (sparse areas)
            }
        } finally {
            setBgLoading(false)
            bgRunningRef.current = false
        }
    }, [])

    const handleViewportChange = useCallback((bounds) => {
        fetchViewport(bounds)
    }, [fetchViewport])

    // Kick off background streaming once first viewport has delivered data
    const hasStartedBgRef = useRef(false)
    useEffect(() => {
        if (!hasStartedBgRef.current && areas.length > 0 && !loading) {
            hasStartedBgRef.current = true
            startBackgroundFetch()
        }
    }, [areas.length, loading, startBackgroundFetch])

    const [selectedId, setSelectedId] = useState(null)
    const [areaDraft, setAreaDraft] = useState(null) // { id, name, storeIds }
    const [geometryEditingId, setGeometryEditingId] = useState(null)
    const [savingArea, setSavingArea] = useState(false)
    const [focusStoreId, setFocusStoreId] = useState(null)
    const [creating, setCreating] = useState(false)
    const [expandedStores, setExpandedStores] = useState([])
    const [groupDraft, setGroupDraft] = useState(null) // { id?, name, storeId, areaIds }
    const [editingGroupName, setEditingGroupName] = useState(false)
    const [savingGroup, setSavingGroup] = useState(false)
    const [error, setError] = useState(null)
    const [testCity, setTestCity] = useState('')
    const [testStreet, setTestStreet] = useState('')
    const [testBuilding, setTestBuilding] = useState('')
    const [testPoint, setTestPoint] = useState(null)
    const [testLabel, setTestLabel] = useState('')
    const [testResult, setTestResult] = useState(null)
    const [testing, setTesting] = useState(false)

    const selectedArea = areas.find(a => a.id === selectedId) || null

    useEffect(() => {
        if (groupDraft || creating) {
            setTestResult(null)
        }
    }, [groupDraft, creating])

    // While drafting, keep the saved member state of the edited group visible (purple)
    const viewGroup = groupDraft?.id ? groups.find(g => g.id === groupDraft.id) : null
    const groupAreaIds = useMemo(() => viewGroup?.areaIds || [], [viewGroup])
    const draftAreaIds = useMemo(() => groupDraft?.areaIds || [], [groupDraft])

    const focusStore = stores.find(s => s.id === focusStoreId) || null
    const servedAreaIds = useMemo(
        () => areas.filter(a => a.stores?.some(s => s.storeId === focusStoreId)).map(a => a.id),
        [areas, focusStoreId]
    )
    const focusStoreCoords = focusStore?.address?.location?.coordinates
    const focusPoint = useMemo(() => {
        if (focusStoreCoords) return { lat: focusStoreCoords[1], lng: focusStoreCoords[0] }
        return testPoint
    }, [focusStoreCoords, testPoint])

    // Pan to the selected area group (center of its polygons, or its store when empty) — only on group selection, not on every area toggle
    const focusGroupPoint = useMemo(() => {
        if (!groupDraft) return null
        const targetGroup = groupDraft.id ? groups.find(g => g.id === groupDraft.id) : null
        const ids = targetGroup?.areaIds?.length ? targetGroup.areaIds : groupDraft.areaIds
        if (ids?.length) {
            let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity, count = 0
            areas.forEach(a => {
                if (!ids.includes(a.id)) return
                const coords = a.location?.coordinates || []
                coords.forEach(ring => ring.forEach(([lng, lat]) => {
                    if (lat < minLat) minLat = lat
                    if (lat > maxLat) maxLat = lat
                    if (lng < minLng) minLng = lng
                    if (lng > maxLng) maxLng = lng
                    count++
                }))
            })
            if (count) return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 }
        }
        const storeId = targetGroup?.storeId || groupDraft.storeId
        const store = stores.find(s => s.id === storeId)
        const c = store?.address?.location?.coordinates
        if (Array.isArray(c) && c.length === 2) return { lat: c[1], lng: c[0] }
        return null
    }, [groupDraft?.id, groups, areas, stores])

    function handleNewArea() {
        if (groupDraft || geometryEditingId) return
        setError(null)
        setCreating(true)
        setSelectedId(null)
        setAreaDraft(null)
        setGeometryEditingId(null)
    }

    // ——— Area popup (Option H: view → edit via bubble, geometry via footer) ———
    function handleSelectArea(id) {
        if (groupDraft) return
        if (geometryEditingId) return
        setError(null)
        setSelectedId(id)
        setAreaDraft(null)
    }
    function handleStartAreaPropsEdit() {
        if (!selectedArea) return
        setError(null)
        setAreaDraft({ id: selectedArea.id, name: selectedArea.name || '', storeIds: (selectedArea.stores || []).map(s => s.storeId) })
    }
    function handleCancelAreaPropsEdit() {
        setAreaDraft(null)
        setError(null)
    }
    function handleSaveAreaProps(draftOverride) {
        const draft = draftOverride || areaDraft
        if (!draft) return
        const { id, name, storeIds } = draft
        setSavingArea(true)
        setError(null)
        apiReq('supply_area/update', { id, name: (name || '').trim(), stores: storeIds })
            .then(updated => {
                setAreas(prev => prev.map(a => a.id === id ? { ...a, name: updated.name, stores: updated.stores } : a))
                setAreaDraft(null)
            })
            .catch(err => setError(toMessage(err)))
            .finally(() => setSavingArea(false))
    }
    function handleStartGeometryEdit() {
        if (!selectedArea) return
        setError(null)
        setAreaDraft(null)
        setGeometryEditingId(selectedArea.id)
    }
    function handleGeometryCommit(id, geometry) {
        setGeometryEditingId(null)
        setError(null)
        apiReq('supply_area/update', { id, location: geometry })
            .then(updated => { if (updated?.id) patchArea(updated) })
            .catch(err => setError(toMessage(err)))
    }
    function handleGeometryCancel() { setGeometryEditingId(null) }
    function handleDeleteAreaPopup() {
        if (!selectedArea) return
        const deletedId = selectedArea.id
        setError(null)
        apiReq('supply_area/delete', { id: deletedId })
            .then(() => { removeArea(deletedId); setSelectedId(null); setAreaDraft(null); setGeometryEditingId(null) })
            .catch(err => setError(toMessage(err)))
    }

    // Clicking a saved group expands it inline into edit mode with its areas highlighted
    function startGroupEdit(group) {
        if (groupDraft?.id === group.id) return
        if (geometryEditingId) return
        setError(null)
        setCreating(false)
        setSelectedId(null)
        setAreaDraft(null)
        setGeometryEditingId(null)
        setGroupDraft({ id: group.id, name: group.name, storeId: group.storeId, areaIds: [...(group.areaIds || [])] })
        setEditingGroupName(false)
        setExpandedStores(prev => prev.includes(group.storeId) ? prev : [...prev, group.storeId])
    }

    // Dirty: name changed OR area membership changed (set equality). Save disabled until dirty.
    const groupDirty = useMemo(() => {
        if (!groupDraft) return false
        // New group (no id yet) — considered dirty when it has a valid name; enables Save for creation
        if (!groupDraft.id) return !!groupDraft.name?.trim() && !!groupDraft.storeId
        const orig = groups.find(g => g.id === groupDraft.id)
        if (!orig) return true
        const nameChanged = (orig.name || '').trim() !== (groupDraft.name || '').trim()
        const a = [...(orig.areaIds || [])].sort()
        const b = [...(groupDraft.areaIds || [])].sort()
        const areasChanged = a.length !== b.length || a.some((v, i) => v !== b[i])
        return nameChanged || areasChanged
    }, [groupDraft, groups])

    function toggleStoreExpand(storeId) {
        setExpandedStores(prev =>
            prev.includes(storeId) ? prev.filter(id => id !== storeId) : [...prev, storeId])
    }

    function handleToggleGroupArea(areaId) {
        if (!groupDraft) return
        if (!groupDraft.id && error) setError(null)
        const has = groupDraft.areaIds.includes(areaId)
        setGroupDraft({
            ...groupDraft,
            areaIds: has ? groupDraft.areaIds.filter(id => id !== areaId) : [...groupDraft.areaIds, areaId]
        })
    }

    async function handleSaveGroup() {
        if (!groupDraft) return
        const { id, name, storeId, areaIds } = groupDraft
        if (!name?.trim() || !storeId) {
            setError('supply_group_details_required')
            return
        }
        if (id && !groupDirty) return
        setSavingGroup(true)
        setError(null)
        try {
            // Auto-assign store to member areas if not already assigned — patch single ids
            const areasNeedingStore = areas.filter(a => areaIds.includes(a.id) && !a.stores?.some(s => s.storeId === storeId))
            if (areasNeedingStore.length) {
                const updatedAreas = await Promise.all(areasNeedingStore.map(area => {
                    const storeIds = [...new Set([...(area.stores || []).map(s => s.storeId), storeId])]
                    return apiReq('supply_area/update', { id: area.id, stores: storeIds })
                }))
                updatedAreas.forEach(u => { if (u?.id) patchArea(u) })
            }
            await apiReq(id ? 'area_group/update' : 'area_group/create', { ...(id ? { id } : {}), name: name.trim(), storeId, areaIds })
            refetchGroups()
            setGroupDraft(null)
            setEditingGroupName(false)
        } catch (err) {
            setError(toMessage(err))
        } finally {
            setSavingGroup(false)
        }
    }

    function handleCreateGroup() {
        if (!groupDraft || groupDraft.id) return
        const { name, areaIds } = groupDraft
        const missingName = !name?.trim()
        const missingAreas = !areaIds?.length
        if (missingName || missingAreas) {
            const parts = []
            if (missingName) parts.push(TR('supply_group_name_required'))
            if (missingAreas) parts.push(TR('supply_no_area_groups'))
            setError(parts.join(' — '))
            return
        }
        handleSaveGroup()
    }

    function handleNewGroupInline(storeId) {
        if (creating || geometryEditingId) return
        if (groupDraft && !groupDraft.id && groupDraft.storeId === storeId) return
        setError(null)
        setCreating(false)
        setSelectedId(null)
        setAreaDraft(null)
        setGeometryEditingId(null)
        setGroupDraft({ id: null, name: '', storeId, areaIds: [] })
        setEditingGroupName(true)
        setExpandedStores(prev => prev.includes(storeId) ? prev : [...prev, storeId])
    }

    function handleCancelGroupDraft() {
        setGroupDraft(null)
        setEditingGroupName(false)
        setError(null)
    }

    function handleDeleteGroup() {
        const groupId = groupDraft?.id
        if (!groupId) return
        setError(null)
        apiReq('area_group/delete', { id: groupId })
            .then(() => {
                refetchGroups()
                setGroupDraft(null)
                setEditingGroupName(false)
            })
            .catch(err => setError(toMessage(err)))
    }

    function handleMapBackgroundClick() {
        if (groupDraft || creating || geometryEditingId) return
        setSelectedId(null)
        setAreaDraft(null)
    }

    function handleCancelCreate() {
        setCreating(false)
    }

    function handleMapCreated(geometry) {
        setCreating(false)
        setError(null)
        apiReq('supply_area/create', { location: geometry })
            .then(created => {
                if (created?.id) patchArea(created)
                if (created?.id) setSelectedId(created.id)
            })
            .catch(err => setError(toMessage(err)))
    }

    async function handleTest() {
        if (!testCity || !testStreet || !testBuilding) {
            setTestResult({ error: 'supply_test_missing_fields' })
            return
        }
        setTesting(true)
        setError(null)
        setTestResult(null)
        try {
            const geocoded = await apiReq('geocode/lookup', {
                city: testCity,
                street: testStreet,
                building: testBuilding
            })
            const coords = geocoded?.location?.coordinates
            if (!Array.isArray(coords) || coords.length < 2) {
                setTestResult({ error: TR('supply_no_service') })
                return
            }
            const [lng, lat] = coords
            const res = await apiReq('supply_area/lookup', { lng, lat })
            setTestResult(res)
            setTestPoint({ lat, lng })
            setTestLabel(res.hasService ? `${TR('supply_in_area')}: ${res.area?.name}` : TR('supply_no_service'))
        } catch (err) {
            setTestResult({ error: toMessage(err) })
        } finally {
            setTesting(false)
        }
    }
    return (
        <Flex tag={Card} col className={styles.container}>
            <div className={styles.header}>
                <Flex gap={8} alignItems="end" className={styles.headerControls}>
                    <Input
                        className={styles.headerInput}
                        label="city"
                        name="city"
                        value={testCity}
                        onChange={(e) => setTestCity(e.target.value)}
                    />
                    <Input
                        className={styles.headerInput}
                        label="street"
                        name="street"
                        value={testStreet}
                        onChange={(e) => setTestStreet(e.target.value)}
                    />
                    <Input
                        className={styles.headerInput}
                        label="building"
                        name="building"
                        value={testBuilding}
                        onChange={(e) => setTestBuilding(e.target.value)}
                    />
                    <Button
                        className={styles.headerBtn}
                        size="s"
                        icon="search"
                        onClick={handleTest}
                        loading={testing}
                    >
                        test
                    </Button>
                    {testResult && (
                        <div className={testResult.error ? styles.testResultError : styles.testResult}>
                            <Text size="none">
                                {testResult.error
                                    ? testResult.error
                                    : testResult.hasService
                                        ? null
                                        : TR('supply_no_service')}
                            </Text>
                        </div>
                    )}
                    {groupDraft && (
                        <div className={`${styles.hint} ${styles.groupHint}`}>
                            <Text size="none">{`${TR('supply_group_hint')} "${groupDraft.name}"`}</Text>
                        </div>
                    )}
                    {creating && (
                        <div className={styles.hint}><Text size="none">supply_draw_hint</Text></div>
                    )}
                    {error && <div className={styles.errorBanner}><Text size="none">{error}</Text></div>}
                </Flex>
                <Flex gap={8} alignItems="end" justifyContent="flex-end" className={styles.headerActions}>
                    {creating && (
                        <Button className={styles.headerBtn} size="s" mode="outline" onClick={handleCancelCreate}>supply_cancel_draw</Button>
                    )}
                    <Button className={styles.headerBtn} size="s" icon="add" onClick={handleNewArea} disabled={!!groupDraft || !!geometryEditingId}>new area</Button>
                </Flex>
            </div>


            <Flex className={styles.body}>
                <div className={styles.sidebar}>

                    <div className={styles.storeListPane}>
                        <h4 className={styles.storeListTitle}><Text>supply_stores_groups</Text></h4>
                        {!stores.length && <div className={styles.empty}><Text>supply_no_stores</Text></div>}
                        {stores.map(store => {
                            const storeGroups = groups.filter(g => g.storeId === store.id)
                            const expanded = expandedStores.includes(store.id)
                            return (
                                <div key={store.id} className={styles.storeBranch}>
                                    <div
                                        className={`${styles.storeListItem} ${store.id === focusStoreId ? styles.active : ''}`}
                                        onClick={() => setFocusStoreId(prev => prev != store.id ? store.id : null)}
                                    >
                                        <span className={styles.storeListName}>{store.name}</span>
                                        <span className={styles.storeListAddress}>{[store.address?.city, store.address?.street, store.address?.building].filter(Boolean).join(', ')}</span>
                                        <button
                                            type="button"
                                            className={`${styles.expander} ${expanded ? styles.expanderOpen : ''}`}
                                            title={TR(expanded ? 'supply_hide_groups' : 'supply_show_groups')}
                                            onClick={(e) => { e.stopPropagation(); toggleStoreExpand(store.id) }}
                                        >
                                            <Icon name="down" />
                                        </button>
                                    </div>
                                    {expanded && (
                                        <div className={styles.groupChildren}>
                                            {storeGroups.map(group => {
                                                const isEditing = groupDraft?.id === group.id
                                                return (
                                                    <div key={group.id} className={`${styles.groupCard} ${isEditing ? styles.groupCardExpanded : ''}`}>
                                                        <div
                                                            className={`${styles.groupCardHeader} ${isEditing ? styles.groupCardHeaderExpanded : ''}`}
                                                            onClick={() => {
                                                                if (isEditing) {
                                                                    handleCancelGroupDraft()
                                                                } else {
                                                                    startGroupEdit(group)
                                                                }
                                                            }}
                                                            title={isEditing ? TR('cancel') : undefined}
                                                        >
                                                            <div className={styles.groupHeaderStart}>
                                                                <span className={styles.groupHeaderIcon}>
                                                                    {isEditing ? (
                                                                        <Icon name="sortUp" className={styles.groupArrowIcon} />
                                                                    ) : (
                                                                        <span className={styles.groupDot} />
                                                                    )}
                                                                </span>
                                                                {!isEditing && (
                                                                    <span className={styles.storeListName}>{group.name}</span>
                                                                )}
                                                            </div>
                                                            {!isEditing && (
                                                                <span className={styles.groupCount}>{(group.areaIds || []).length}</span>
                                                            )}
                                                        </div>
                                                        <div className={styles.groupCardContentWrap}>
                                                            <div className={styles.groupCardContentInner}>
                                                                <div className={styles.groupEditPane} onClick={e => e.stopPropagation()}>
                                                                    {editingGroupName && isEditing ? (
                                                                        <input
                                                                            className={styles.groupNameInput}
                                                                            value={groupDraft?.name ?? group.name}
                                                                            onChange={e => setGroupDraft(prev => ({ ...prev, name: e.target.value }))}
                                                                            onBlur={() => setEditingGroupName(false)}
                                                                            onKeyDown={e => { if (e.key === 'Enter') setEditingGroupName(false) }}
                                                                            placeholder={TR('name')}
                                                                            autoFocus
                                                                        />
                                                                    ) : (
                                                                        <div
                                                                            className={styles.groupNameRow}
                                                                            onClick={() => { if (isEditing) setEditingGroupName(true) }}
                                                                        >
                                                                            <span className={styles.groupNameText}>
                                                                                {(isEditing ? groupDraft?.name : group.name) || TR('name')}
                                                                            </span>
                                                                            <span className={styles.groupNameEditIcon} title={TR('edit')}>
                                                                                <Icon name="edit" />
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                    <div className={styles.editorMeta}>
                                                                        <Text size="none">{`${(isEditing ? groupDraft?.areaIds : group.areaIds || []).length} ${TR('supply_areas_selected')}`}</Text>
                                                                    </div>
                                                                    <div className={styles.groupEditHint}>
                                                                        <Text size="none">supply_group_hint</Text>
                                                                    </div>
                                                                    <Flex gap={8} justifyContent="space-between" alignItems="center">
                                                                        <ConfirmButton
                                                                            q={`${TR('supply_delete_group_confirm')} "${groups.find(g => g.id === groupDraft?.id)?.name}"?`}
                                                                            onOk={handleDeleteGroup}
                                                                            size="s"
                                                                            mode="outline"
                                                                            icon="trash"
                                                                            className={styles.deleteButton}
                                                                        />
                                                                        <Flex gap={8}>
                                                                            <Button size="s" mode="outline" onClick={handleCancelGroupDraft}>cancel</Button>
                                                                            <Button
                                                                                size="s"
                                                                                icon="check"
                                                                                loading={savingGroup}
                                                                                disabled={!groupDirty || !groupDraft?.name?.trim()}
                                                                                onClick={handleSaveGroup}
                                                                            >
                                                                                save
                                                                            </Button>
                                                                        </Flex>
                                                                    </Flex>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                            {/* New group draft (id === null) — shown inline under its store */}
                                            {groupDraft && !groupDraft.id && groupDraft.storeId === store.id && (
                                                <div className={`${styles.groupCard} ${styles.groupCardExpanded}`}>
                                                    <div
                                                        className={`${styles.groupCardHeader} ${styles.groupCardHeaderExpanded}`}
                                                        onClick={handleCancelGroupDraft}
                                                        title={TR('cancel')}
                                                    >
                                                        <div className={styles.groupHeaderStart}>
                                                            <span className={styles.groupHeaderIcon}>
                                                                <Icon name="sortUp" className={styles.groupArrowIcon} />
                                                            </span>
                                                            <span className={styles.storeListName}><Text size="none">supply_new_area_group</Text></span>
                                                        </div>
                                                    </div>
                                                    <div className={styles.groupCardContentWrap}>
                                                        <div className={styles.groupCardContentInner}>
                                                            <div className={styles.groupEditPane} onClick={e => e.stopPropagation()}>
                                                                <input
                                                                    className={styles.groupNameInput}
                                                                    value={groupDraft.name}
                                                                    onChange={e => { if (error) setError(null); setGroupDraft(prev => ({ ...prev, name: e.target.value })) }}
                                                                    placeholder={TR('name')}
                                                                    autoFocus
                                                                />
                                                                <div className={styles.editorMeta}>
                                                                    <Text size="none">{`${groupDraft.areaIds.length} ${TR('supply_areas_selected')}`}</Text>
                                                                </div>
                                                                <div className={styles.groupEditHint}>
                                                                    <Text size="none">supply_group_hint</Text>
                                                                </div>
                                                                <Flex gap={8} justifyContent="end">
                                                                    <Button size="s" mode="outline" onClick={handleCancelGroupDraft}>cancel</Button>
                                                                    <Button
                                                                        size="s"
                                                                        icon="check"
                                                                        loading={savingGroup}
                                                                        onClick={handleCreateGroup}
                                                                    >
                                                                        create
                                                                    </Button>
                                                                </Flex>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            <div
                                                className={`${styles.storeListItem} ${styles.addGroupRow}`}
                                                onClick={() => handleNewGroupInline(store.id)}
                                            >
                                                <Icon name="add" />
                                                <span className={styles.addGroupLabel}><Text size="none">supply_new_area_group</Text></span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                </div>

                <div className={styles.mapPane}>
                    {loading && !areas.length ? (
                        <div style={{ position: 'absolute', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.7)', color: '#64748b' }}>Loading areas…</div>
                    ) : null}
                    <SupplyAreaMap
                        areas={areas}
                        stores={stores}
                        activeStoreIds={selectedArea?.stores?.map(s => s.storeId) || []}
                        servedAreaIds={servedAreaIds}
                        groupAreaIds={groupAreaIds}
                        draftAreaIds={draftAreaIds}
                        toggleMode={!!groupDraft}
                        onToggleArea={handleToggleGroupArea}
                        focusPoint={focusPoint}
                        focusGroupPoint={focusGroupPoint}
                        selectedId={selectedId}
                        areaDraft={areaDraft}
                        setAreaDraft={setAreaDraft}
                        geometryEditingId={geometryEditingId}
                        drawing={creating}
                        testPoint={testPoint}
                        testLabel={testLabel}
                        savingArea={savingArea}
                        onSelect={handleSelectArea}
                        onBackgroundClick={handleMapBackgroundClick}
                        onCreated={handleMapCreated}
                        onEdited={handleGeometryCommit}
                        onGeometryCancel={handleGeometryCancel}
                        onStartAreaPropsEdit={handleStartAreaPropsEdit}
                        onSaveAreaProps={handleSaveAreaProps}
                        onCancelAreaPropsEdit={handleCancelAreaPropsEdit}
                        onDeleteArea={handleDeleteAreaPopup}
                        onStartGeometryEdit={handleStartGeometryEdit}
                        onViewportChange={handleViewportChange}
                    />
                    {bgLoading && areas.length > 0 ? (
                        <div style={{ position: 'absolute', bottom: 8, right: 60, background: 'rgba(255,255,255,0.9)', padding: '4px 8px', borderRadius: 6, fontSize: 11, color: '#64748b' }}>Loading all areas… {areas.length}</div>
                    ) : null}
                </div>
            </Flex>
        </Flex>
    )
}