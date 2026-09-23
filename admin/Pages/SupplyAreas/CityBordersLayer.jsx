import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { useText } from 'common/texts/TextProvider'
import apiReq from 'common/functions/apiReq'
import styles from './supplyAreas.module.css'

// City / municipal jurisdiction borders as a clickable reference overlay.
// Click a border → popup with the city name + "create polygon" button that
// instantly duplicates the city's border as a new supply area.
//
// DATA SOURCE (official): Ministry of Interior —
// "גבולות שיפוט רשויות מקומיות וועדים מקומיים – רצף"
// (ArcGIS item 069298e81f8e4e6fb96aa59913c113cd, ITM/EPSG:2039 shapefile).
// Converted once: reproject ITM→WGS84, DISSOLVE by municipality (the source
// layer stacks whole-council + va'ad subdivision polygons — dissolving leaves
// one true outline per city/council), drop "ללא שיפוט" (unassigned) areas,
// topology-preserving simplify (~8%), 5-decimal coords.
// TO UPDATE: publish a new file from DevTools → City borders (no code change,
// no redeploy — the map reads the URL from the cityBordersUrl setting).
// City-borders GeoJSON lives on the files CDN; only its path is stored, in the
// `cityBordersUrl` setting (published from DevTools, no redeploy). Resolved
// once per session.
// Permanent name labels only when zoomed in enough to stay readable.
const LABEL_MIN_ZOOM = 11
// Manual nudge (meters, [east, north]) applied to the whole layer at load.
// The file is properly projected so this stays [0, 0] — only touch it if a
// systematic mismatch against the basemap is ever found (e.g. [70, 40]).
// No rebuild needed: plain constant, fetched file untouched.
const BORDERS_OFFSET_METERS = [0, 0]

function applyOffset(fc) {
    const [dx, dy] = BORDERS_OFFSET_METERS
    if (!dx && !dy) return fc
    const dLon = dx / 95000
    const dLat = dy / 111000
    const shift = (c) => (typeof c?.[0] === 'number' ? [c[0] + dLon, c[1] + dLat] : c.map(shift))
    for (const f of fc.features || []) {
        if (f.geometry?.coordinates) f.geometry.coordinates = shift(f.geometry.coordinates)
    }
    return fc
}

// Shared across remounts (tileset switches recreate the map) — resolved + fetched once.
let bordersUrlPromise = null
function loadBordersUrl() {
    if (!bordersUrlPromise) {
        bordersUrlPromise = apiReq('supply_area/city_borders', {})
            .then(res => res?.url || null)
            .catch(() => null)
    }
    return bordersUrlPromise
}

let bordersPromise = null
function loadBorders() {
    if (!bordersPromise) {
        bordersPromise = loadBordersUrl()
            .then(url => fetch(url))
            .then(r => {
                if (!r.ok) throw new Error(`city borders HTTP ${r.status}`)
                return r.json()
            })
            .then(fc => {
                applyOffset(fc)
                for (const f of fc.features || []) f.properties._bbox = bboxOf(f.geometry)
                return fc
            })
            .catch(err => {
                console.error('[CityBorders] failed to load:', err)
                bordersPromise = null
                return null
            })
    }
    return bordersPromise
}

function bboxOf(geom) {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
    const walk = (c) => {
        if (typeof c?.[0] === 'number') {
            if (c[0] < w) w = c[0]
            if (c[0] > e) e = c[0]
            if (c[1] < s) s = c[1]
            if (c[1] > n) n = c[1]
        } else if (Array.isArray(c)) {
            c.forEach(walk)
        }
    }
    walk(geom?.coordinates || [])
    return [w, s, e, n]
}

const intersects = (bb, b) =>
    bb[0] <= b.getEast() && bb[2] >= b.getWest() && bb[1] <= b.getNorth() && bb[3] >= b.getSouth()

// Exterior-ring vertex count (closed ring repeats first point — don't count it twice)
function countVertices(geometry) {
    if (!geometry?.coordinates?.length) return 0
    const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    return polys.reduce((n, poly) => n + (poly[0]?.length ? poly[0].length - 1 : 0), 0)
}

export default function CityBordersLayer({ visible, drawing, toggleMode, geometryEditingId, cuttingId, darkBasemap, onCreateArea }) {
    const map = useMap()
    const { TR } = useText()
    const dataRef = useRef(null)
    const stRef = useRef({ visible, drawing, toggleMode, geometryEditingId, cuttingId, darkBasemap, onCreateArea, TR })
    stRef.current = { visible, drawing, toggleMode, geometryEditingId, cuttingId, darkBasemap, onCreateArea, TR }

    useEffect(() => {
        const openCityPopup = (latlng, name, geometry) => {
            const st = stRef.current
            const el = L.DomUtil.create('div', styles.cityPopup)
            // Same guard as the area popup: keep popup clicks off the map bg-click handler
            L.DomEvent.on(el, 'mousedown', L.DomEvent.stopPropagation)
            L.DomEvent.on(el, 'click', L.DomEvent.stopPropagation)
            const head = L.DomUtil.create('div', styles.cityPopupHead, el)
            const title = L.DomUtil.create('strong', styles.cityPopupTitle, head)
            title.textContent = name || ''
            // Same convention as the area popup (vertices of exterior rings)
            const verts = L.DomUtil.create('span', styles.cityPopupVerts, head)
            verts.textContent = `vertices: ${countVertices(geometry)}`
            const btn = L.DomUtil.create('button', styles.cityPopupBtn, el)
            btn.type = 'button'
            // Plus icon matching the shared Button's `add` icon (Lucide LuPlus)
            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>'
            btn.appendChild(document.createTextNode(st.TR('supply_create_polygon')))
            L.DomEvent.on(btn, 'click', (ev) => {
                L.DomEvent.stop(ev)
                btn.disabled = true
                map.closePopup()
                st.onCreateArea?.(name, geometry)
            })
            L.popup({ maxWidth: 260, closeButton: true, className: styles.cityPopupWrap })
                .setLatLng(latlng)
                .setContent(el)
                .openOn(map)
        }

        // Interactive (clickable) but kept under area polygons via bringToBack,
        // so area clicks still select areas, not cities.
        // Solid (not dashed): adjacent municipalities share exact edges, and two
        // dashed strokes with different phase look like a double line.
        const layer = L.geoJSON(null, {
            style: { color: '#64748b', weight: 1, fillOpacity: 0 },
            interactive: true,
            onEachFeature: (f, l) => {
                l.on('click', (e) => {
                    const st = stRef.current
                    if (!st.visible || st.drawing || st.toggleMode || st.geometryEditingId || st.cuttingId) return
                    // Canvas-rendered paths aren't DOM targets, so the map bg-click
                    // guard can't filter them — stop the event here instead.
                    if (e.originalEvent) L.DomEvent.stop(e.originalEvent)
                    openCityPopup(e.latlng, f.properties?.name, f.geometry)
                })
            },
        })
        let cancelled = false

        const refresh = () => {
            const data = dataRef.current
            if (cancelled || !data || !stRef.current.visible) return
            const bounds = map.getBounds()
            const showLabels = map.getZoom() >= LABEL_MIN_ZOOM
            layer.clearLayers()
            layer.addData((data.features || []).filter(f => intersects(f.properties._bbox, bounds)))
            layer.bringToBack()
            layer.eachLayer(l => {
                const name = l.feature?.properties?.name
                if (showLabels && name) {
                    l.bindTooltip(name, {
                        permanent: true,
                        direction: 'center',
                        className: stRef.current.darkBasemap
                            ? `${styles.cityLabel} ${styles.cityLabelDark}`
                            : styles.cityLabel,
                    })
                } else {
                    l.unbindTooltip()
                }
            })
        }

        if (stRef.current.visible) layer.addTo(map)
        loadBorders().then(data => {
            if (cancelled) return
            dataRef.current = data
            refresh()
        })
        map.on('moveend zoomend', refresh)
        return () => {
            cancelled = true
            map.off('moveend zoomend', refresh)
            map.removeLayer(layer)
        }
    }, [map, visible, darkBasemap])

    return null
}
