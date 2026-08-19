const isClient = typeof window !== 'undefined'

export default async function apiReq(path, data = {}, fields) {
    //const info = { platform: isClient ? (window.APP_PLATFORM || 'web') : 'server' }

    let body = data//{ data: data, fields, info }

    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'app-version': APP_VERSION
    }

    if (data.files) {
        const fData = new FormData()
        Object.keys(data.files).forEach(k => {
            Array.from(data.files[k]).forEach(f => fData.append('files', f, `${k}:${f.name}`))
        })
        delete data.files
        fData.append('fData', JSON.stringify(body))
        body = fData
        delete headers['Content-Type']
    } else
        body = JSON.stringify(body)

    try {
        const
            base = isClient ? '' : (process.env.INTERNAL_API_URL || `http://localhost:${process.env.PORT || 1990}`),
            res = await fetch(`${base}/api/${path}`, {
                method: 'POST',
                body,
                headers,
                credentials: 'same-origin'
            }),
            result = await res.json().catch(() => ({ status: res.status }))

        if (!res.ok || result.status !== 200) throw result
        return result.data
    } catch (err) {
        if (err.status === 401 && isClient) {
            location.reload()
        }
        else
            throw err.message || err
    }
}