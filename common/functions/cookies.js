export function getCookie(name) {
    if (typeof document === 'undefined') return null
    const prefix = `${name}=`
    for (const part of document.cookie.split(';')) {
        const value = part.trim()
        if (value.startsWith(prefix))
            return decodeURIComponent(value.slice(prefix.length))
    }
    return null
}

export function setCookie(name, value, { maxAge = 60 * 60 * 24 * 365, sameSite = 'Lax' } = {}) {
    if (typeof document === 'undefined') return
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=${sameSite}${secure}`
}

export function deleteCookie(name) {
    if (typeof document === 'undefined') return
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`
}
