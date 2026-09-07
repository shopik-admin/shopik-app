export default async function exp(payload, { DL }) {
    const { category, subCategory, domainId } = payload || {}

    const filter = {}
    if (category) filter.category = String(category).toLowerCase()
    if (subCategory) filter.subCategory = String(subCategory).toLowerCase()
    if (domainId) filter.domainId = domainId

    // DL.Setting.read auto-decrypts config values, so the file holds plaintext
    const docs = await DL.Setting.read(filter, { _id: 0 }, { limit: 0 })

    return {
        exportedAt: new Date().toISOString(),
        scope: {
            category: category || null,
            subCategory: subCategory || null,
            domainId: domainId || null
        },
        settings: (docs || []).map((s) => ({
            key: s.key,
            value: s.value,
            category: s.category,
            subCategory: s.subCategory,
            domainId: s.domainId,
            formType: s.formType,
            renderType: s.renderType,
            public: s.public
        }))
    }
}

exp.config = {
    permissions: ['setting:read']
}
