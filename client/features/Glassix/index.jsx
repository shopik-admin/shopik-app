import { useEffect } from 'react'
import { useAppData } from 'App'
import { resolveGlassixConfig } from 'common/functions/glassix.js'
import { loadGlassixAfterPageLoad } from './loader.js'
import './glassix.css'

// Renders nothing of its own: the launcher is injected into the document by the
// Glassix script. `settings` comes from window.__SD__ at boot and never changes
// client-side, so the effect runs once per page. Re-injection is guarded inside
// loadGlassix, which keeps StrictMode's double-invoke and SPA remounts safe.
export default function GlassixWidget() {
    const { settings } = useAppData() || {}

    useEffect(() => {
        const config = resolveGlassixConfig(settings)
        if (!config) return
        return loadGlassixAfterPageLoad(config)
    }, [])

    return null
}
