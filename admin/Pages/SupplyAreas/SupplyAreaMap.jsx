import { useCallback, useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import Text from 'common/components/Text'
import { useText } from 'common/texts/TextProvider'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import StoreListEditor from './StoreListEditor'
import styles from './supplyAreas.module.css'

const ISRAEL_CENTER = [31.7683, 35.2137]
const SNAP_THRESHOLD_PX = 20
const TILESET_STORAGE_KEY = 'supplyMapTileset'

// All basemaps are free to use (attribution required) — Hebrew labels forced via lang=he where supported (CARTO)
const TILESETS = {
    light: {
        label: 'supply_map_minimal',
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png?lang=he',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
    dark: {
        label: 'supply_map_dark',
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png?lang=he',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
    osm: {
        label: 'supply_map_standard',
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
    satellite: {
        label: 'supply_map_satellite',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri',
    },
}

const polygonStyle = ({ selected, draftMember, groupMember, served }) => {
    if (selected) return { color: '#2563eb', weight: 2.5, fillColor: '#3b82f6', fillOpacity: 0.35 }
    if (draftMember || groupMember) return { color: '#7c3aed', weight: 2, fillColor: '#8b5cf6', fillOpacity: 0.4 }
    if (served) return { color: '#195855', weight: 2, fillColor: '#195855', fillOpacity: 0.28 }
    return { color: '#64748b', weight: 1.5, fillColor: '#94a3b8', fillOpacity: 0.15 }
}

const STORE_PIN_HTML = (color) => `
    <svg viewBox="0 0 24 24" style="width:26px;height:26px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
        <circle cx="12" cy="9" r="3" fill="#fff"/>
    </svg>`

const storePinIcon = (active) => L.divIcon({
    className: '',
    html: STORE_PIN_HTML(active ? '#16a34a' : '#64748b'),
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24],
})

const TEST_ICON = L.divIcon({
    className: '',
    html: `
        <svg viewBox="0 0 24 24" style="width:30px;height:30px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.5))">
            <path d="M12 1.8l2.6 5.8 6.4.5-4.8 4.2 1.5 6.3L12 15.5 6.3 18.6l1.5-6.3L3 8.1l6.4-.5z" fill="#7c3aed" stroke="#fff" stroke-width="1.3"/>
        </svg>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
})

function FlyToPoint({ point }) {
    const map = useMap()
    useEffect(() => {
        if (point) map.panTo([point.lat, point.lng], { animate: true, duration: 1 })
    }, [point, map])
    return null
}

const buttonStyle = `
display:block;
min-width: 200px;
border-radius:6px;
margin-bottom:10px;
padding:10px 14px;
color:#fff;
font-weight:600;
font-size:13px;
text-align:center;`
// Custom Save/Cancel control shown while a single area is being vertex-edited
function createEditActionsControl(map, labels, onSave, onCancel) {
    const control = new L.Control({ position: 'bottomright' })
    control.onAdd = () => {
        const container = L.DomUtil.create('div', 'leaflet-control')
        container.style.cssText = 'display:flex;flex-direction:row;gap:8px;background:transparent;overflow:hidden;'

        const save = L.DomUtil.create('a', '', container)
        save.href = '#'
        save.title = labels.save
        save.innerHTML = `&#10003; ${labels.save}`
        save.style.cssText = `${buttonStyle}background:#195855;`
        save.onclick = (ev) => { L.DomEvent.stop(ev); onSave() }

        const cancel = L.DomUtil.create('a', '', container)
        cancel.href = '#'
        cancel.title = labels.cancel
        cancel.innerHTML = `&#10005; ${labels.cancel}`
        cancel.style.cssText = `${buttonStyle}background:#475569;`
        cancel.onclick = (ev) => { L.DomEvent.stop(ev); onCancel() }

        return container
    }
    map.addControl(control)
    return control
}

// leaflet-draw is a UMD bundle referencing the global `L`. Under Vite there is no
// global, so expose it first and then dynamically import the plugin.
function useDrawReady() {
    const [ready, setReady] = useState(false)

    useEffect(() => {
        let mounted = true

        async function load() {
            try {
                if (!window.L) window.L = L
                await import('leaflet-draw')
                if (mounted) setReady(true)
            } catch (e) {
                console.error('Failed to load leaflet-draw:', e)
            }
        }
        load()

        return () => { mounted = false }
    }, [])

    return ready
}

function MapController({
    areas,
    selectedId,
    geometryEditingId,
    servedAreaIds,
    groupAreaIds,
    draftAreaIds,
    toggleMode,
    drawing,
    onSelect,
    onToggleArea,
    onCreated,
    onEdited,
    onGeometryCancel,
    onBackgroundClick
}) {
    const map = useMap()
    const { TR } = useText()
    const drawReady = useDrawReady()
    const groupRef = useRef(null)
    const layersRef = useRef(new Map())
    const drawHandlerRef = useRef(null)
    const snapTargetsRef = useRef([])
    const editLayerRef = useRef(null)
    const editOriginalRef = useRef(null)
    const editControlRef = useRef(null)
    const cbRef = useRef({ onSelect, onToggleArea, onCreated, onEdited, onGeometryCancel, onBackgroundClick, selectedId, geometryEditingId, drawing, toggleMode })
    cbRef.current = { onSelect, onToggleArea, onCreated, onEdited, onGeometryCancel, onBackgroundClick, selectedId, geometryEditingId, drawing, toggleMode }

    const removeEditControl = useCallback(() => {
        if (editControlRef.current) {
            map.removeControl(editControlRef.current)
            editControlRef.current = null
        }
    }, [map])

    // Discard unsaved vertex moves and restore the original shape
    const revertEdit = useCallback(() => {
        const cur = editLayerRef.current
        if (cur && editOriginalRef.current) {
            cur.getLatLngs().forEach((ring, i) => ring.forEach((point, j) => {
                const orig = editOriginalRef.current?.[i]?.[j]
                if (orig) {
                    point.lat = orig.lat
                    point.lng = orig.lng
                }
            }))
            cur.redraw()
        }
    }, [])

    // Disable vertex editing on the active layer and remove Save/Cancel control
    const stopEdit = useCallback(() => {
        const layer = editLayerRef.current
        if (layer?.editing) layer.editing.disable()
        editLayerRef.current = null
        editOriginalRef.current = null
        removeEditControl()
    }, [removeEditControl])

    const commitEdit = useCallback(() => {
        const cur = editLayerRef.current
        const geometry = cur?.toGeoJSON?.().geometry
        const id = cur?.supplyAreaId
        stopEdit()
        if (cur && geometry) cbRef.current.onEdited?.(id, geometry)
    }, [stopEdit])

    const cancelEdit = useCallback(() => {
        revertEdit()
        stopEdit()
        cbRef.current.onGeometryCancel?.()
    }, [revertEdit, stopEdit])

    const startEdit = useCallback((layer) => {
        if (editLayerRef.current === layer) return
        if (!L.Edit?.Poly || !L.LatLngUtil?.cloneLatLngs) return
        stopEdit()
        if (layer.editing) layer.editing.disable()
        layer.editing = new L.Edit.Poly(layer)
        editOriginalRef.current = L.LatLngUtil.cloneLatLngs(layer.getLatLngs())
        layer.editing.enable()
        editLayerRef.current = layer
        editControlRef.current = createEditActionsControl(map, {
            save: TR('supply_save_changes'),
            cancel: TR('cancel')
        }, () => commitEdit(), () => cancelEdit())
    }, [map, stopEdit, TR, commitEdit, cancelEdit])

    // Clicking empty map closes area popup (when not drawing/group-editing/geometry-editing)
    // Guard against polygon clicks bubbling to map (they fire layer 'click' then map 'click')
    useEffect(() => {
        function onBgClick(e) {
            if (cbRef.current.drawing || cbRef.current.toggleMode || cbRef.current.geometryEditingId) return
            // Ignore clicks that originated on a polygon/path - handled by layer handler
            const target = e.originalEvent?.target
            if (target?.closest?.('.leaflet-interactive')) return
            if (target?.tagName?.toLowerCase() === 'path') return
            // Leaflet may have _stopped flag on the DOM event when layer called stopPropagation
            if (e.originalEvent?._stopped) return
            cbRef.current.onBackgroundClick?.()
        }
        map.on('click', onBgClick)
        return () => map.off('click', onBgClick)
    }, [map])

    // Render all area polygons — click selects area (popup); geometry edit only via footer button
    useEffect(() => {
        stopEdit()
        const group = groupRef.current || L.featureGroup().addTo(map)
        groupRef.current = group
        group.clearLayers()
        layersRef.current.clear()

        areas.forEach(area => {
            const rings = (area.location?.coordinates || []).map(ring =>
                ring.map(([lng, lat]) => [lat, lng])
            )
            const layer = L.polygon(rings, polygonStyle({}))
            layer.supplyAreaId = area.id
            layer.on('click', (e) => {
                if (e.originalEvent) L.DomEvent.stop(e.originalEvent)
                if (cbRef.current.toggleMode) {
                    cbRef.current.onToggleArea?.(area.id)
                    return
                }
                if (cbRef.current.drawing) return
                if (cbRef.current.geometryEditingId) return
                const isSelected = cbRef.current.selectedId === area.id
                cbRef.current.onSelect?.(isSelected ? null : area.id)
            })
            group.addLayer(layer)
            layersRef.current.set(area.id, layer)
        })

        return () => group.clearLayers()
    }, [map, areas])

    // Highlight: selected (blue) > current group members (purple) > served by store (orange) > default.
    useEffect(() => {
        layersRef.current.forEach((layer, id) => {
            layer.setStyle(polygonStyle({
                selected: id === selectedId,
                draftMember: draftAreaIds.includes(id),
                groupMember: !toggleMode && groupAreaIds.includes(id),
                served: servedAreaIds.includes(id)
            }))
        })
    }, [selectedId, servedAreaIds, groupAreaIds, draftAreaIds, toggleMode])

    // Refresh snapping targets (existing area vertices)
    useEffect(() => {
        const points = []
        areas.forEach(area =>
            area.location?.coordinates?.forEach(ring =>
                ring.forEach(([lng, lat]) => points.push(L.latLng(lat, lng)))
            )
        )
        snapTargetsRef.current = points
    }, [areas])

    // Snap vertices to nearby existing-area vertices within threshold (in screen px).
    const snapInPlace = useCallback((rings) => {
        if (!rings?.length || !snapTargetsRef.current.length) return false

        let changed = false
        rings.forEach(ring => ring.forEach(point => {
            const containerPoint = map.latLngToContainerPoint(point)
            let best = null
            let bestDist = SNAP_THRESHOLD_PX

            for (const target of snapTargetsRef.current) {
                const dist = containerPoint.distanceTo(map.latLngToContainerPoint(target))
                if (dist <= bestDist) {
                    bestDist = dist
                    best = target
                }
            }
            if (best) {
                point.lat = best.lat
                point.lng = best.lng
                changed = true
            }
        }))

        return changed
    }, [map])

    const snapLayer = useCallback((layer) => {
        const rings = layer.getLatLngs?.()
        if (!rings?.length) return
        if (snapInPlace(rings)) layer.redraw()
    }, [snapInPlace])

    // Live snap while dragging a vertex (in place, so dragging away again unsnaps)
    const onEditVertex = useCallback((e) => {
        const poly = e?.poly
        if (!poly || poly !== editLayerRef.current) return
        if (!snapInPlace(poly.getLatLngs())) return

        poly.redraw()
        const edit = poly.editing
        const rings = poly.getLatLngs()
        edit?._verticesHandlers?.forEach((handler, ringIdx) => {
            const ring = rings[ringIdx]
            handler._markers?.forEach((marker, j) => {
                const latlng = ring?.[j]
                if (latlng) marker.setLatLng(latlng)
            })
        })
    }, [snapInPlace])

    // Start/cancel vertex editing when parent sets geometryEditingId (Edit shape flow, Option H)
    useEffect(() => {
        if (!geometryEditingId) {
            if (editLayerRef.current) {
                revertEdit()
                stopEdit()
            }
            return
        }
        const layer = layersRef.current.get(geometryEditingId)
        if (layer) startEdit(layer)
    }, [geometryEditingId, startEdit, revertEdit, stopEdit])

    // New-area draw completion + live vertex snapping
    useEffect(() => {
        if (!drawReady) return

        function onCreated(e) {
            const layer = e.layer
            if (!(layer instanceof L.Polygon)) return

            if (drawHandlerRef.current) {
                drawHandlerRef.current.disable()
                drawHandlerRef.current = null
            }

            snapLayer(layer)
            map.removeLayer(layer)
            cbRef.current.onCreated?.(layer.toGeoJSON().geometry)
        }

        map.on(L.Draw.Event.CREATED, onCreated)
        map.on(L.Draw.Event.EDITVERTEX, onEditVertex)

        return () => {
            map.off(L.Draw.Event.CREATED, onCreated)
            map.off(L.Draw.Event.EDITVERTEX, onEditVertex)
        }
    }, [map, drawReady, onEditVertex, snapLayer])

    // "New Area" mode: programmatic polygon draw handler
    useEffect(() => {
        if (!drawReady) return

        if (!drawing) {
            if (drawHandlerRef.current) {
                drawHandlerRef.current.disable()
                drawHandlerRef.current = null
            }
            return
        }

        const handler = new L.Draw.Polygon(map, {
            allowIntersection: false,
            shapeOptions: { color: '#3b82f6', weight: 2 }
        })
        handler.enable()
        drawHandlerRef.current = handler
        stopEdit()

        function onDrawStop() {
            drawHandlerRef.current = null
        }
        map.on(L.Draw.Event.DRAWSTOP, onDrawStop)

        return () => {
            map.off(L.Draw.Event.DRAWSTOP, onDrawStop)
            handler.disable()
            if (drawHandlerRef.current === handler) drawHandlerRef.current = null
        }
    }, [map, drawReady, drawing, stopEdit])

    return null
}

export default function SupplyAreaMap({
    areas = [], stores = [], activeStoreIds = [], servedAreaIds = [], groupAreaIds = [], draftAreaIds = [],
    focusPoint, focusGroupPoint, testPoint, testLabel,
    selectedId, geometryEditingId, areaDraft, setAreaDraft, savingArea,
    onSelect, onStartAreaPropsEdit, onSaveAreaProps, onCancelAreaPropsEdit, onDeleteArea, onStartGeometryEdit,
    ...mapControllerProps
}) {
    const { TR } = useText()

    const selectedArea = areas.find(a => a.id === selectedId) || null
    const popupPosition = (() => {
        if (!selectedArea?.location?.coordinates?.length || geometryEditingId) return null
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity, count = 0
        selectedArea.location.coordinates.forEach(ring => ring.forEach(([lng, lat]) => {
            if (lat < minLat) minLat = lat
            if (lat > maxLat) maxLat = lat
            if (lng < minLng) minLng = lng
            if (lng > maxLng) maxLng = lng
            count++
        }))
        if (!count) return null
        return [(minLat + maxLat) / 2, (minLng + maxLng) / 2]
    })()
    const isAreaEditing = !!areaDraft && areaDraft.id === selectedId
    const areaStoresForEditor = isAreaEditing ? (areaDraft.storeIds || []).map(id => ({ storeId: id })) : []
    // Tileset: explicit user pick persists; otherwise follows the admin dark/light theme
    const [tilesetId, setTilesetId] = useState(() => {
        const stored = localStorage.getItem(TILESET_STORAGE_KEY)
        if (stored && TILESETS[stored]) return stored
        return document.documentElement.getAttribute('data-theme')
    })
    const [customTileset, setCustomTileset] = useState(() => !!localStorage.getItem(TILESET_STORAGE_KEY))

    useEffect(() => {
        if (customTileset) return
        const observer = new MutationObserver(() => {
            setTilesetId(document.documentElement.getAttribute('data-theme'))
        })
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
        return () => observer.disconnect()
    }, [customTileset])

    const pickTileset = (id) => {
        localStorage.setItem(TILESET_STORAGE_KEY, id)
        setCustomTileset(true)
        setTilesetId(id)
    }

    const tileset = TILESETS[tilesetId] || TILESETS.osm

    const storePins = stores.filter(store => {
        const c = store.address?.location?.coordinates
        return Array.isArray(c) && c.length === 2
    })

    return (
        <div style={{ position: 'relative', top: '16px', right: '10px', height: '99%' }}>
            <MapContainer
                center={ISRAEL_CENTER}
                zoom={12}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom
            >
                <TileLayer
                    key={tilesetId}
                    url={tileset.url}
                    attribution={tileset.attribution}
                />
                <MapController
                    areas={areas}
                    servedAreaIds={servedAreaIds}
                    groupAreaIds={groupAreaIds}
                    draftAreaIds={draftAreaIds}
                    selectedId={selectedId}
                    geometryEditingId={geometryEditingId}
                    onSelect={onSelect}
                    {...mapControllerProps}
                />
                {selectedArea && popupPosition && (
                    <Popup
                        position={popupPosition}
                        maxWidth={420}
                        minWidth={300}
                        autoClose={false}
                        closeOnClick={false}
                        eventHandlers={{ remove: () => onSelect?.(null) }}
                    >
                        <div className={styles.areaPopup} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                            {!isAreaEditing ? (
                                <>
                                    <div className={styles.areaPopupHeader}>
                                        <strong className={styles.areaPopupTitle}>{selectedArea.name || <Text size="none">supply_no_area_groups</Text>}</strong>
                                        <Flex gap={6} className={styles.areaPopupActions}>
                                            <Button size="s" icon="edit" onClick={onStartAreaPropsEdit}></Button>
                                            <Button size="s" icon="trash" mode="outline" onClick={onDeleteArea}></Button>
                                        </Flex>
                                    </div>
                                    <div className={styles.areaPopupStores}>
                                        {(selectedArea.stores || []).length ? (
                                            (selectedArea.stores || []).map(s => {
                                                const st = stores.find(x => x.id === s.storeId)
                                                return <span key={s.storeId} className={styles.areaPopupTag}>{st ? `${st.name} (${st.tag})` : s.storeId}</span>
                                            })
                                        ) : (
                                            <span className={styles.areaPopupEmpty}><Text size="none">supply_no_stores_assigned</Text></span>
                                        )}
                                    </div>
                                    <Flex gap={8} justifyContent="end" style={{ marginTop: 8 }}>
                                        <Button size="s" mode="outline" onClick={() => onSelect?.(null)}>cancel</Button>
                                        <Button size="s" icon="edit" onClick={onStartGeometryEdit}>supply_edit_shape</Button>
                                    </Flex>
                                </>
                            ) : (
                                <>
                                    <div className={styles.areaPopupHeader}>
                                        <input
                                            className={styles.groupNameInput}
                                            value={areaDraft.name}
                                            onChange={e => setAreaDraft(prev => ({ ...prev, name: e.target.value }))}
                                            placeholder={TR('name')}
                                            autoFocus
                                        />
                                    </div>
                                    <StoreListEditor
                                        stores={stores}
                                        areaStores={areaStoresForEditor}
                                        onChange={ids => setAreaDraft(prev => ({ ...prev, storeIds: ids }))}
                                    />
                                    <Flex gap={8} justifyContent="end" style={{ marginTop: 8 }}>
                                        <Button size="s" mode="outline" onClick={onCancelAreaPropsEdit}>cancel</Button>
                                        <Button size="s" icon="check" loading={savingArea} onClick={onSaveAreaProps}>save</Button>
                                    </Flex>
                                </>
                            )}
                        </div>
                    </Popup>
                )}
                {storePins.map(store => {
                    const [lng, lat] = store.address.location.coordinates
                    const active = activeStoreIds.includes(store.id)
                    const a = store.address || {}
                    return (
                        <Marker
                            key={store.id}
                            position={[lat, lng]}
                            icon={storePinIcon(active)}
                        >
                            <Popup>
                                <div>
                                    <strong>{store.name}</strong>
                                    {store.tag && <span> ({store.tag})</span>}
                                    <div style={{ fontSize: 12, color: '#475569' }}>
                                        {[a.city, a.street, a.building].filter(Boolean).join(', ')}
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    )
                })}
                {testPoint && (
                    <Marker
                        position={[testPoint.lat, testPoint.lng]}
                        icon={TEST_ICON}
                    >
                        <Popup>{testLabel}</Popup>
                    </Marker>
                )}
                <FlyToPoint point={focusPoint} />
                <FlyToPoint point={focusGroupPoint} />
                <FlyToPoint point={testPoint} />
            </MapContainer>
            <div className={styles.tilePicker}>
                {Object.entries(TILESETS).map(([id, ts]) => (
                    <button
                        key={id}
                        type="button"
                        title={`${TR('supply_basemap')}: ${TR(ts.label)}`}
                        className={id === tilesetId ? `${styles.tileBtn} ${styles.tileBtnActive}` : styles.tileBtn}
                        onClick={() => pickTileset(id)}
                    >
                        <Text size="none">{ts.label}</Text>
                    </button>
                ))}
            </div>
        </div>
    )
}
