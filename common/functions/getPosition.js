// One-shot GPS read as a promise. Never rejects — resolves null when the browser
// has no geolocation, the user denies it, or the fix doesn't arrive in time.
export default function getPosition(timeoutMs = 8000) {
    return new Promise(resolve => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
        let done = false
        const finish = coords => { if (done) return; done = true; clearTimeout(timer); resolve(coords) }
        const timer = setTimeout(() => finish(null), timeoutMs)
        navigator.geolocation.getCurrentPosition(
            pos => finish([pos.coords.longitude, pos.coords.latitude]),
            () => finish(null),
            { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
        )
    })
}
