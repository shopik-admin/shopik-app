export const ADMIN_TOKEN_EXPIRY_MS = 1000 * 60 * 60 * 24 * 30
export const USER_TOKEN_EXPIRY_MS = 1000 * 60 * 60 * 24 * 30
export const ADMIN_TOKEN_COOKIE = 'at'
export const USER_TOKEN_COOKIE = 'ut'

export const GUEST_CART_TOKEN_COOKIE = 'gc'
export const GUEST_CART_TTL_MS = 1000 * 60 * 60 * 24 * 30
export const SUPPORTED_ADMIN_PLATFORMS = [
    'admin',
    'admin_app',
    'admin_mobile'
]

export const CACHE_STRATEGIES = {
    VERSION: 'version',
    HASHSET: 'hashset'
}