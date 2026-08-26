import { useMemo, useState } from 'react'
import useApi from 'common/functions/useApi'
import apiReq from 'common/functions/apiReq'
import Button from 'common/components/Button'
import Input from 'common/components/Input'
import Flex from 'common/components/Flex'
import Card from 'common/components/Card'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import Form from 'common/components/Form'
import { useModal } from 'common/components/Modal'
import { useText } from 'common/texts/TextProvider'
import SupplyAreaMap from './SupplyAreaMap'
import StoreListEditor from './StoreListEditor'
import styles from './supplyAreas.module.css'

const toMessage = (err) => (typeof err === 'string' ? err : err?.message || 'something went wrong')

function AreaForm({ area, geometry, onClose, onSuccess }) {
    const [saving, setSaving] = useState(false)

    async function handleAction(vals) {
        setSaving(true)
        try {
            const payload = { name: vals.name?.trim() ?? '' }
            if (area) {
                await apiReq('supply_area/update', { id: area.id, ...payload })
                onSuccess(area)
            } else {
                const created = await apiReq('supply_area/create', { ...payload, location: geometry })
                onSuccess(created)
            }
            onClose()
        } catch (err) {
            throw toMessage(err)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Form action={handleAction} className={styles.areaForm} noSubmit>
            <Input
                label="name"
                name="name"
                defaultValue={area?.name || ''}
            />

            <Flex gap={8} justifyContent="end" className={styles.formActions}>
                <Button type="button" onClick={onClose} disabled={saving} mode="outline">cancel</Button>
                <Button type="submit" loading={saving}>
                    {area ? 'supply_save_changes' : 'supply_create_area'}
                </Button>
            </Flex>
        </Form>
    )
}

function GroupForm({ group, stores, defaultStoreId = '', onClose, onSuccess }) {
    const { TR } = useText()

    async function handleAction(vals) {
        const name = vals.name?.trim() ?? ''
        const storeId = vals.storeId ?? ''
        if (!name) throw TR('supply_group_name_required')
        if (!storeId) throw TR('supply_choose_store_required')
        onSuccess({ name, storeId })
        onClose()
    }

    return (
        <Form action={handleAction} className={styles.areaForm} noSubmit>
            <Input
                label="name"
                name="name"
                required
                defaultValue={group?.name || ''}
            />
            <div className={styles.groupStoreField}>
                <label className={styles.groupStoreLabel}><Text size="none">supply_store</Text></label>
                <select
                    className={styles.storeSelect}
                    name="storeId"
                    defaultValue={group?.storeId || defaultStoreId || ''}
                >
                    {stores.map(store => (
                        <option key={store.id} value={store.id}>{store.name} ({store.tag})</option>
                    ))}
                </select>
            </div>

            <Flex gap={8} justifyContent="end" className={styles.formActions}>
                <Button type="button" onClick={onClose} mode="outline">cancel</Button>
                <Button type="submit">{group ? 'supply_save_changes' : 'supply_next_select_areas'}</Button>
            </Flex>
        </Form>
    )
}

export default function SupplyAreas() {
    const { TR } = useText()
    const { data: areas = [], callReq, setData, loading } = useApi('supply_area/read', { limit: 0 })
    const { data: stores = [] } = useApi('store/read')
    const { data: groups = [], callReq: refetchGroups } = useApi('area_group/read', { limit: 0 })
    const { openModal, closeModal } = useModal()

    const [selectedId, setSelectedId] = useState(null)
    const [focusStoreId, setFocusStoreId] = useState(null)
    const [creating, setCreating] = useState(false)
    const [expandedStores, setExpandedStores] = useState([])
    const [groupDraft, setGroupDraft] = useState(null) // { id?, name, storeId, areaIds }
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

    function openAreaForm(area = null, geometry = null) {
        openModal(
            <AreaForm
                area={area}
                geometry={geometry}
                onClose={closeModal}
                onSuccess={(result) => {
                    callReq()
                    setSelectedId(result.id)
                    setError(null)
                }}
            />,
            { title: area ? `${TR('edit')} ${area.name}` : TR('supply_new_supply_area') }
        )
    }

    function handleNewArea() {
        if (groupDraft) return
        setError(null)
        setCreating(true)
        setSelectedId(null)
    }

    function openGroupForm(group = null, defaultStoreId = '') {
        if (creating) return
        setError(null)
        openModal(
            <GroupForm
                group={group}
                stores={stores}
                defaultStoreId={defaultStoreId}
                onClose={closeModal}
                onSuccess={({ name, storeId }) => {
                    setCreating(false)
                    setSelectedId(null)
                    setGroupDraft(prev => {
                        const sameSubject = prev && (prev.id ?? null) === (group?.id ?? null)
                        const areaIds = sameSubject
                            ? prev.areaIds
                            : (group ? [...(group.areaIds || [])] : [])
                        return { id: group?.id ?? null, name, storeId, areaIds }
                    })
                }}
            />,
            { title: group ? `${TR('edit')} ${group.name}` : TR('supply_new_area_group') }
        )
    }

    // Clicking a saved group jumps straight into edit mode with its areas highlighted
    function startGroupEdit(group) {
        if (groupDraft?.id === group.id) return
        setError(null)
        setCreating(false)
        setSelectedId(null)
        setGroupDraft({ id: group.id, name: group.name, storeId: group.storeId, areaIds: [...(group.areaIds || [])] })
    }

    function toggleStoreExpand(storeId) {
        setExpandedStores(prev =>
            prev.includes(storeId) ? prev.filter(id => id !== storeId) : [...prev, storeId])
    }

    function handleToggleGroupArea(areaId) {
        if (!groupDraft) return
        const has = groupDraft.areaIds.includes(areaId)
        const area = areas.find(a => a.id === areaId)
        if (!has && !area?.stores?.some(s => s.storeId === groupDraft.storeId)) {
            const storeIds = [...new Set([...(area?.stores || []).map(s => s.storeId), groupDraft.storeId])]
            apiReq('supply_area/update', { id: areaId, stores: storeIds })
                .then(updated => setData(prev => prev.map(a => a.id === areaId ? { ...a, stores: updated.stores } : a)))
                .catch(err => setError(toMessage(err)))
        }
        setGroupDraft({
            ...groupDraft,
            areaIds: has ? groupDraft.areaIds.filter(id => id !== areaId) : [...groupDraft.areaIds, areaId]
        })
    }

    function handleSaveGroup() {
        if (!groupDraft) return
        const { id, name, storeId, areaIds } = groupDraft
        if (!name?.trim() || !storeId) {
            setError('supply_group_details_required')
            return
        }
        setSavingGroup(true)
        setError(null)
        apiReq(id ? 'area_group/update' : 'area_group/create', { ...(id ? { id } : {}), name: name.trim(), storeId, areaIds })
            .then(() => {
                refetchGroups()
                setGroupDraft(null)
            })
            .catch(err => setError(toMessage(err)))
            .finally(() => setSavingGroup(false))
    }

    function handleCancelGroupDraft() {
        setGroupDraft(null)
        setError(null)
    }

    function handleDeleteGroup() {
        const groupId = groupDraft?.id
        if (!groupId) return
        const groupName = groups.find(g => g.id === groupId)?.name
        if (!window.confirm(`${TR('supply_delete_group_confirm')} "${groupName}"?`)) return
        setError(null)
        apiReq('area_group/delete', { id: groupId })
            .then(() => {
                refetchGroups()
                setGroupDraft(null)
            })
            .catch(err => setError(toMessage(err)))
    }

    function handleMapBackgroundClick() {
        setSelectedId(null)
    }

    function handleCancelCreate() {
        setCreating(false)
    }

    function handleMapCreated(geometry) {
        setCreating(false)
        setError(null)
        apiReq('supply_area/create', { location: geometry })
            .then(created => {
                callReq()
                setSelectedId(created.id)
            })
            .catch(err => setError(toMessage(err)))
    }

    function handleMapEdited(id, geometry) {
        setError(null)
        apiReq('supply_area/update', { id, location: geometry })
            .then(() => {
                setSelectedId(null)
                return callReq()
            })
            .catch(err => setError(toMessage(err)))
    }

    function handleDeleteArea() {
        if (!selectedArea) return
        if (!window.confirm(`${TR('supply_delete_area_confirm')} "${selectedArea.name}"?`)) return
        setError(null)
        apiReq('supply_area/delete', { id: selectedArea.id })
            .then(() => {
                callReq()
                setSelectedId(null)
            })
            .catch(err => setError(toMessage(err)))
    }

    function handleStoresChange(id, storeIds) {
        setError(null)
        apiReq('supply_area/update', { id, stores: storeIds })
            .then(updated => {
                setData(prev => prev.map(a => a.id === id ? { ...a, stores: updated.stores } : a))
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
            const [lng, lat] = geocoded.location.coordinates
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
                <Flex gap={8} alignItems="end">
                    <Input
                        label="city"
                        name="city"
                        value={testCity}
                        onChange={(e) => setTestCity(e.target.value)}
                    />
                    <Input
                        label="street"
                        name="street"
                        value={testStreet}
                        onChange={(e) => setTestStreet(e.target.value)}
                    />
                    <Input
                        label="building"
                        name="building"
                        value={testBuilding}
                        onChange={(e) => setTestBuilding(e.target.value)}
                    />
                    <Button size="s" icon="search" onClick={handleTest} loading={testing}>test</Button>
                    {testResult && (
                        <div className={testResult.error ? styles.testResultError : styles.testResult}>
                            <Text size="none">
                                {testResult.error
                                    ? testResult.error
                                    : testResult.hasService
                                        ? `${TR('supply_in_area')}: ${testResult.area?.name}`
                                        : TR('supply_no_service')}
                            </Text>
                        </div>
                    )}
                </Flex>
                <Flex gap={8} justifyContent="flex-end">
                    {creating && (
                        <Button size="s" mode="outline" onClick={handleCancelCreate}>supply_cancel_draw</Button>
                    )}
                    <Button size="s" icon="add" onClick={handleNewArea} disabled={!!groupDraft}>new area</Button>
                </Flex>
            </div>

            {error && <div className={styles.errorBanner}><Text size="none">{error}</Text></div>}
            {creating && (
                <div className={styles.hint}><Text size="none">supply_draw_hint</Text></div>
            )}
            {groupDraft && (
                <div className={`${styles.hint} ${styles.groupHint}`}>
                    <Text size="none">{`${TR('supply_group_hint')} "${groupDraft.name}"`}</Text>
                </div>
            )}

            <Flex className={styles.body}>
                <div className={styles.sidebar}>

                    {selectedArea && (
                        <div className={styles.editor}>
                            <div className={styles.editorHeader}>
                                <h3 className={styles.editorTitle}>{selectedArea.name}</h3>
                                <Flex gap={6}>
                                    <Button size="s" icon="edit" onClick={() => openAreaForm(selectedArea)}>edit</Button>
                                    <Button size="s" icon="trash" mode="outline" onClick={handleDeleteArea}>delete</Button>
                                </Flex>
                            </div>
                            <StoreListEditor
                                stores={stores}
                                areaStores={selectedArea.stores || []}
                                onChange={(ids) => handleStoresChange(selectedArea.id, ids)}
                            />
                        </div>
                    )}

                    {groupDraft ? (
                        <div className={styles.editor}>
                            <div className={styles.editorHeader}>
                                <h3 className={styles.editorTitle}>
                                    <Text size="none">{groupDraft.id ? 'supply_edit_area_group' : 'supply_new_area_group'}</Text>
                                </h3>
                                {groupDraft.id && (
                                    <Flex gap={6}>
                                        <Button
                                            size="s"
                                            icon="edit"
                                            mode="outline"
                                            onClick={() => openGroupForm({ id: groupDraft.id, name: groupDraft.name, storeId: groupDraft.storeId })}
                                        >
                                            edit
                                        </Button>
                                        <Button size="s" icon="trash" mode="outline" onClick={handleDeleteGroup}>delete</Button>
                                    </Flex>
                                )}
                            </div>
                            <div className={styles.editorMeta}><Text size="none">{`${TR('name')}: ${groupDraft.name}`}</Text></div>
                            <div className={styles.editorMeta}>
                                <Text size="none">{`${TR('supply_store')}: ${stores.find(s => s.id === groupDraft.storeId)?.name || '—'}`}</Text>
                            </div>
                            <div className={styles.editorMeta}>
                                <Text size="none">{`${groupDraft.areaIds.length} ${TR('supply_areas_selected')}`}</Text>
                            </div>
                            <Flex gap={8} justifyContent="end">
                                <Button size="s" mode="outline" onClick={handleCancelGroupDraft}>cancel</Button>
                                <Button
                                    size="s"
                                    icon="check"
                                    loading={savingGroup}
                                    disabled={!groupDraft.name?.trim() || !groupDraft.storeId}
                                    onClick={handleSaveGroup}
                                >
                                    save
                                </Button>
                            </Flex>
                        </div>
                    ) : null}

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
                                        onClick={() => setFocusStoreId(store.id)}
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
                                            {storeGroups.map(group => (
                                                <div
                                                    key={group.id}
                                                    className={`${styles.storeListItem} ${styles.groupListItem} ${groupDraft?.id === group.id ? styles.active : ''}`}
                                                    onClick={() => startGroupEdit(group)}
                                                >
                                                    <span className={styles.groupDot} />
                                                    <span className={styles.storeListName}>{group.name}</span>
                                                    <span className={styles.groupCount}>{(group.areaIds || []).length}</span>
                                                </div>
                                            ))}
                                            <div
                                                className={`${styles.storeListItem} ${styles.addGroupRow}`}
                                                onClick={() => openGroupForm(null, store.id)}
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
                        drawing={creating}
                        testPoint={testPoint}
                        testLabel={testLabel}
                        onSelect={setSelectedId}
                        onBackgroundClick={handleMapBackgroundClick}
                        onCreated={handleMapCreated}
                        onEdited={handleMapEdited}
                    />
                </div>
            </Flex>
        </Flex>
    )
}