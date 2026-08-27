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

export const WINDOWS_PAGE = {
    FOCUS_START_HOUR: 6,
    FOCUS_END_HOUR: 22,
    HOUR_PX: 64,
    MAX_CAPACITY: 100
}

export const SPECIAL_DAY_EREV_START = 13

export const ADDRESS_PROVIDERS = {
    GOVMAP: 'govmap',
    OSM: 'osm',
    GOOGLE: 'google',
    HYBRID: 'hybrid'
}
export const ADDRESS_PROVIDER_CHAIN = {
    [ADDRESS_PROVIDERS.GOVMAP]: [ADDRESS_PROVIDERS.GOVMAP],
    [ADDRESS_PROVIDERS.OSM]: [ADDRESS_PROVIDERS.OSM],
    [ADDRESS_PROVIDERS.GOOGLE]: [ADDRESS_PROVIDERS.GOOGLE],
    [ADDRESS_PROVIDERS.HYBRID]: [ADDRESS_PROVIDERS.GOVMAP, ADDRESS_PROVIDERS.OSM, ADDRESS_PROVIDERS.GOOGLE]
}