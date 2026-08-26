const CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://*.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https: ws: wss:",
    "frame-src https://pay.hyp.co.il",
    "form-action 'self' https:",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "object-src 'none'"
].join('; ')

export default function securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'SAMEORIGIN')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), payment=(self)')
    res.setHeader('Content-Security-Policy', CSP)
    if (process.env.PRODUCTION)
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    next()
}
