export default async function getShippingConfig(DL, domainId) {
    try {
        const domain = domainId || 'default'
        const setting = await DL.Setting.readOne({ key: 'shipping', domainId: domain })
        if (setting?.value) return setting.value
        // fallback to default domain if not found
        if (domain !== 'default') {
            const fallback = await DL.Setting.readOne({ key: 'shipping', domainId: 'default' })
            if (fallback?.value) return fallback.value
        }
        // legacy: maybe stored without domainId filter or different domain
        if (!setting) {
            const any = await DL.Setting.readOne({ key: 'shipping' })
            if (any?.value) return any.value
        }
        return null
    } catch {
        return null
    }
}
