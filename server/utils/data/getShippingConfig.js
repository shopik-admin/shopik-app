export default async function getShippingConfig(DL, domainId) {
    try {
        if (!domainId) return null
        const setting = await DL.Setting.readOne({ key: 'shipping', domainId })
        if (setting?.value) return setting.value
        // fallback to the default domain's config when this domain has none
        const def = await DL.Domain.readOne({ isDefault: true, active: true }, { _id: 0, id: 1 })
        if (def?.id && def.id !== domainId) {
            const fallback = await DL.Setting.readOne({ key: 'shipping', domainId: def.id })
            if (fallback?.value) return fallback.value
        }
        return null
    } catch {
        return null
    }
}
