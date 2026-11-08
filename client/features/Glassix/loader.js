// Injects the Glassix chat widget, mirroring their official snippet so a future
// widget.1.x bump is diffable: primary cdn.glassix.com, cdn.glassix.net on
// error, both flagged with the #glassix-widget-script id.
//
// Two deliberate differences from the snippet:
//  - options are passed as an argument instead of the global `widgetOptions`;
//  - the whole thing only runs after the page has loaded (see
//    loadGlassixAfterPageLoad), so the widget's own bundle — it ships its own
//    React, axios and a Rubik @import — never competes with first paint.
import { GLASSIX_ORIGINS, glassixScriptUrl } from 'common/functions/glassix.js'

const SCRIPT_ID = 'glassix-widget-script'
const IDLE_TIMEOUT_MS = 3000
const NO_IDLE_CALLBACK_DELAY_MS = 1000

export function loadGlassix({ apiKey, snippetId } = {}) {
    if (!apiKey || !snippetId) return false
    if (typeof document === 'undefined' || !document.body) return false

    // Already injected (SPA remount) or already running (StrictMode re-run).
    if (window.GlassixWidgetClient || document.getElementById(SCRIPT_ID)) return true

    const anchor = document.getElementsByTagName('script')[0]
    if (!anchor?.parentNode) return false

    const options = { apiKey, snippetId }

    // No crossorigin on purpose. The vendor snippet writes `t.crossorigin =
    // 'anonymous'`, which is not a DOM property (it is crossOrigin), so their
    // script tag is actually fetched in plain non-CORS mode — that is the
    // behavior every Glassix customer runs today, and it depends on nothing the
    // CDN has to opt into. A real crossOrigin here would only make the widget
    // die if the CDN ever dropped Access-Control-Allow-Origin.
    const primary = document.createElement('script')
    primary.async = true
    primary.type = 'text/javascript'
    primary.id = SCRIPT_ID
    // Cloned before src is set, and the id is cloned too, so the fallback keeps
    // the same double-injection guard.
    const fallbackScript = primary.cloneNode()

    let attached = false
    let usedFallback = false

    function attach() {
        if (attached) return
        attached = true
        window.widgetClient = new window.GlassixWidgetClient(options)
        window.widgetClient.attach()
        // Hook Glassix exposes for wrappers that need to know the client is up.
        window.glassixWidgetScriptLoaded?.()
    }

    function onLoad() {
        if (typeof window.GlassixWidgetClient === 'function') attach()
        else useFallback()
    }

    function useFallback() {
        if (usedFallback) return
        usedFallback = true
        primary.remove()
        fallbackScript.onload = onLoad
        fallbackScript.src = glassixScriptUrl(GLASSIX_ORIGINS[1])
        anchor.parentNode.insertBefore(fallbackScript, anchor)
    }

    primary.onload = onLoad
    primary.onerror = useFallback
    primary.src = glassixScriptUrl(GLASSIX_ORIGINS[0])
    anchor.parentNode.insertBefore(primary, anchor)
    return true
}

// Defers the injection until after `load`, then into an idle callback: nothing
// is fetched before the page itself is done, and the widget's JS runs outside
// the window Lighthouse measures for TBT. Returns a cancel function.
export function loadGlassixAfterPageLoad(config) {
    let cancelled = false
    let idleHandle = null
    let delayTimer = null

    function run() {
        idleHandle = null
        delayTimer = null
        if (!cancelled) loadGlassix(config)
    }

    function start() {
        if (cancelled) return
        if (typeof window.requestIdleCallback === 'function')
            idleHandle = window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS })
        else
            // Safari has no requestIdleCallback; a plain delay does the same job.
            delayTimer = setTimeout(run, NO_IDLE_CALLBACK_DELAY_MS)
    }

    if (document.readyState === 'complete') start()
    else window.addEventListener('load', start, { once: true })

    return () => {
        cancelled = true
        window.removeEventListener('load', start)
        if (idleHandle !== null) window.cancelIdleCallback?.(idleHandle)
        if (delayTimer !== null) clearTimeout(delayTimer)
    }
}
