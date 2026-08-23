import { useMemo, useState } from 'react'
import useApi from 'common/functions/useApi'
import apiReq from 'common/functions/apiReq'
import Button from 'common/components/Button'
import Input from 'common/components/Input'
import Flex from 'common/components/Flex'
import Card from 'common/components/Card'
import Text from 'common/components/Text'
import { useModal } from 'common/components/Modal'
import SupplyAreaMap from './SupplyAreaMap'
import StoreListEditor from './StoreListEditor'
import styles from './supplyAreas.module.css'

const toMessage = (err) => (typeof err === 'string' ? err : err?.message || 'Something went wrong')

function AreaForm({ area, geometry, onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        name: area?.name || '',
        key: area?.key || '',
        description: area?.description || ''
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)

    async function handleSubmit(e) {
        e.preventDefault()
        setSaving(true)
        setError(null)
        try {
            const payload = { ...formData }
            if (area) {
                await apiReq('supply_area/update', { id: area.id, ...payload })
                onSuccess(area)
            } else {
                const created = await apiReq('supply_area/create', { ...payload, location: geometry })
                onSuccess(created)
            }
            onClose()
        } catch (err) {
            setError(toMessage(err))
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className={styles.areaForm}>
            <Input
                label="Name"
                name="name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
            <Input
                label="Key"
                name="key"
                required
                value={formData.key}
                onChange={(e) => setFormData({ ...formData, key: e.target.value })}
            />
            <Input
                label="Description"
                name="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />

            {error && <div className={styles.formError}>{error}</div>}

            <Flex gap={8} justifyContent="end" className={styles.formActions}>
                <Button type="button" onClick={onClose} disabled={saving} mode="outline">Cancel</Button>
                <Button type="submit" disabled={saving}>
                    {saving ? 'Saving...' : area ? 'Save Changes' : 'Create Area'}
                </Button>
            </Flex>
        </form>
    )
}

export default function SupplyAreas() {
    const { data: areas = [], callReq, setData, loading } = useApi('supply_area/read', { limit: 0 })
    const { data: stores = [] } = useApi('store/read')
    const { openModal, closeModal } = useModal()

    const [selectedId, setSelectedId] = useState(null)
    const [focusStoreId, setFocusStoreId] = useState(null)
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState(null)
    const [testCity, setTestCity] = useState('')
    const [testStreet, setTestStreet] = useState('')
    const [testBuilding, setTestBuilding] = useState('')
    const [testPoint, setTestPoint] = useState(null)
    const [testLabel, setTestLabel] = useState('')
    const [testResult, setTestResult] = useState(null)
    const [testing, setTesting] = useState(false)

    const selectedArea = areas.find(a => a.id === selectedId) || null

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
            { title: area ? `Edit ${area.name}` : 'New Supply Area' }
        )
    }

    function handleNewArea() {
        setError(null)
        setCreating(true)
        setSelectedId(null)
    }

    function handleCancelCreate() {
        setCreating(false)
    }

    function handleMapCreated(geometry) {
        setCreating(false)
        openAreaForm(null, geometry)
    }

    function handleMapEdited(id, geometry) {
        setError(null)
        apiReq('supply_area/update', { id, location: geometry })
            .then(() => callReq())
            .catch(err => setError(toMessage(err)))
    }

    function handleDeleteArea() {
        if (!selectedArea) return
        if (!window.confirm(`Delete supply area "${selectedArea.name}"?`)) return
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
            setTestResult({ error: 'Enter city, street and building' })
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
            setTestLabel(res.hasService ? `In area: ${res.area?.name}` : 'No service in this area')
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
                        label="City"
                        name="city"
                        value={testCity}
                        onChange={(e) => setTestCity(e.target.value)}
                    />
                    <Input
                        label="Street"
                        name="street"
                        value={testStreet}
                        onChange={(e) => setTestStreet(e.target.value)}
                    />
                    <Input
                        label="Building"
                        name="building"
                        value={testBuilding}
                        onChange={(e) => setTestBuilding(e.target.value)}
                    />
                    <Button size="s" icon="search" onClick={handleTest} loading={testing}>Test</Button>
                    {testResult && (
                        <div className={testResult.error ? styles.testResultError : styles.testResult}>
                            {testResult.error
                                ? testResult.error
                                : testResult.hasService
                                    ? `In area: ${testResult.area?.name}`
                                    : 'No service in this area'}
                        </div>
                    )}
                </Flex>
                <Flex gap={8} justifyContent="flex-end">
                    {creating && (
                        <Button size="s" mode="outline" onClick={handleCancelCreate}>Cancel Draw</Button>
                    )}
                    <Button size="s" icon="add" onClick={handleNewArea}>New Area</Button>
                </Flex>
            </div>

            {error && <div className={styles.errorBanner}>{error}</div>}
            {creating && (
                <div className={styles.hint}>Draw the area polygon on the map, then enter its details.</div>
            )}

            <Flex className={styles.body}>
                <div className={styles.sidebar}>

                    {selectedArea && (
                        <div className={styles.editor}>
                            <div className={styles.editorHeader}>
                                <h3 className={styles.editorTitle}>{selectedArea.name}</h3>
                                <Flex gap={6}>
                                    <Button size="s" icon="edit" onClick={() => openAreaForm(selectedArea)}>Edit</Button>
                                    <Button size="s" icon="trash" mode="outline" onClick={handleDeleteArea}>Delete</Button>
                                </Flex>
                            </div>
                            <div className={styles.editorMeta}>Key: {selectedArea.key}</div>
                            {selectedArea.description && (
                                <div className={styles.editorMeta}>{selectedArea.description}</div>
                            )}
                            <StoreListEditor
                                stores={stores}
                                areaStores={selectedArea.stores || []}
                                onChange={(ids) => handleStoresChange(selectedArea.id, ids)}
                            />
                        </div>
                    )}

                    <div className={styles.storeListPane}>
                        <h4 className={styles.storeListTitle}><Text>Stores</Text></h4>
                        {!stores.length && <div className={styles.empty}><Text>No stores yet</Text></div>}
                        {stores.map(store => (
                            <div
                                key={store.id}
                                className={`${styles.storeListItem} ${store.id === focusStoreId ? styles.active : ''}`}
                                onClick={() => setFocusStoreId(store.id)}
                            >
                                <span className={styles.storeListName}>{store.name}</span>
                                <span className={styles.storeListTag}>{store.tag}</span>
                            </div>
                        ))}
                    </div>

                </div>

                <div className={styles.mapPane}>
                    <SupplyAreaMap
                        areas={areas}
                        stores={stores}
                        activeStoreIds={selectedArea?.stores?.map(s => s.storeId) || []}
                        servedAreaIds={servedAreaIds}
                        focusPoint={focusPoint}
                        selectedId={selectedId}
                        drawing={creating}
                        testPoint={testPoint}
                        testLabel={testLabel}
                        onSelect={setSelectedId}
                        onCreated={handleMapCreated}
                        onEdited={handleMapEdited}
                    />
                </div>
            </Flex>
        </Flex>
    )
}