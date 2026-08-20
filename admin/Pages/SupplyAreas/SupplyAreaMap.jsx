import { useCallback, useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'

const ISRAEL_CENTER = [31.7683, 35.2137]
const SNAP_THRESHOLD_PX = 20

const polygonStyle = (selected, served) => {
    if (selected) return { color: '#2563eb', weight: 2.5, fillColor: '#3b82f6', fillOpacity: 0.35 }
    if (served) return { color: '#f97316', weight: 2, fillColor: '#fb923c', fillOpacity: 0.4 }
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

function FlyToPoint({ point, zoom = 16 }) {
    const map = useMap()
    useEffect(() => {
        if (point) map.flyTo([point.lat, point.lng], zoom, { duration: 1 })
    }, [point])
    return null
}

// Custom Save/Cancel control shown while a single area is being edited
function createEditActionsControl(map, onSave, onCancel) {
    const control = new L.Control({ position: 'bottomright' })
    control.onAdd = () => {
        const container = L.DomUtil.create('div', 'leaflet-control')
        container.style.cssText = 'background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.25);'

        const save = L.DomUtil.create('a', '', container)
        save.href = '#'
        save.title = 'Save changes'
        save.innerHTML = '&#10003; Save'
        save.style.cssText = 'display:block;padding:6px 14px;background:#16a34a;color:#fff;font-weight:600;font-size:13px;text-align:center;'
        save.onclick = (ev) => { L.DomEvent.stop(ev); onSave() }

        const cancel = L.DomUtil.create('a', '', container)
        cancel.href = '#'
        cancel.title = 'Cancel changes'
        cancel.innerHTML = '&#10005; Cancel'
        cancel.style.cssText = 'display:block;padding:6px 14px;background:#fff;color:#475569;font-weight:600;font-size:13px;text-align:center;border-top:1px solid #e2e8f0;'
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
    servedAreaIds,
    drawing,
    onSelect,
    onCreated,
    onEdited
}) {
    const map = useMap()
    const drawReady = useDrawReady()
    const groupRef = useRef(null)
    const layersRef = useRef(new Map())
    const drawHandlerRef = useRef(null)
    const snapTargetsRef = useRef([])
    const editLayerRef = useRef(null)
    const editOriginalRef = useRef(null)
    const editControlRef = useRef(null)
    const cbRef = useRef({ onSelect, onCreated, onEdited, drawing })
    cbRef.current = { onSelect, onCreated, onEdited, drawing }

    // Render all area polygons
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
            const layer = L.polygon(rings, { style: polygonStyle(false) })
            layer.supplyAreaId = area.id
            layer.on('click', () => {
                cbRef.current.onSelect?.(area.id)
                if (cbRef.current.drawing) return
                startEdit(layer)
            })
            group.addLayer(layer)
            layersRef.current.set(area.id, layer)
        })

        return () => group.clearLayers()
    }, [map, areas])

    // Highlight the selected area and areas served by the focused store
    useEffect(() => {
        layersRef.current.forEach((layer, id) => {
            layer.setStyle(polygonStyle(id === selectedId, servedAreaIds.includes(id)))
        })
    }, [selectedId, servedAreaIds])

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
    // Mutates the given LatLng objects in place so leaflet-draw's vertex-marker
    // references stay attached (setLatLngs would detach them and break unsnapping).
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
        ;(edit?._verticesHandlers || []).forEach((handler, ringIdx) => {
            const ring = rings[ringIdx]
            ;(handler._markers || []).forEach((marker, j) => {
                const latlng = ring?.[j]
                if (latlng) marker.setLatLng(latlng)
            })
        })
    }, [snapInPlace])

    const removeEditControl = useCallback(() => {
        if (editControlRef.current) {
            map.removeControl(editControlRef.current)
            editControlRef.current = null
        }
    }, [map])

    // Edit only the clicked area: enable L.Edit.Poly on that layer and show Save/Cancel
    const stopEdit = useCallback(() => {
        const layer = editLayerRef.current
        if (layer?.editing) layer.editing.disable()
        editLayerRef.current = null
        editOriginalRef.current = null
        removeEditControl()
    }, [removeEditControl])

    const startEdit = useCallback((layer) => {
        if (editLayerRef.current === layer) return
        stopEdit()

        if (layer.editing) layer.editing.disable()
        layer.editing = new L.Edit.Poly(layer)
        editOriginalRef.current = L.LatLngUtil.cloneLatLngs(layer.getLatLngs())
        layer.editing.enable()
        editLayerRef.current = layer

        editControlRef.current = createEditActionsControl(map, () => {
            const cur = editLayerRef.current
            const geometry = cur?.toGeoJSON?.().geometry
            stopEdit()
            if (cur && geometry) cbRef.current.onEdited?.(cur.supplyAreaId, geometry)
        }, () => {
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
            stopEdit()
        })
    }, [map, stopEdit])

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

export default function SupplyAreaMap({ areas = [], stores = [], activeStoreIds = [], servedAreaIds = [], focusPoint, testPoint, testLabel, ...mapControllerProps }) {
    const storePins = stores.filter(store => {
        const c = store.address?.location?.coordinates
        return Array.isArray(c) && c.length === 2
    })

    return (
        <div style={{ position: 'relative', height: '100%' }}>
            <MapContainer
                center={ISRAEL_CENTER}
                zoom={12}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapController areas={areas} servedAreaIds={servedAreaIds} {...mapControllerProps} />
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
            </MapContainer>
        </div>
    )
}