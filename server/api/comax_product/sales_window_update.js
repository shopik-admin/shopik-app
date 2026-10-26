import { SALES_WINDOW_KEY, validateSalesWindowInput } from './salesWindow.js'
import { listDepartments } from './sales_window.js'

/**
 * Save the per-department sale windows.
 *
 * Stored as one hidden Setting doc so the generic Settings page never renders
 * it as a raw JSON blob — it is edited only through the Comax Products modal.
 * The value is global (the catalog and the stores are), so it lives on the
 * default domain; reads ignore domainId.
 */
export default async function update(payload, { DL }) {
    const departments = await listDepartments(DL)
    const config = validateSalesWindowInput(payload, departments.map(d => d.code))

    const existing = await DL.Setting.readOne({ key: SALES_WINDOW_KEY })

    if (existing?.id) {
        await DL.Setting.updateOne({ id: existing.id }, { value: config, hidden: true })
    } else {
        const domain = await DL.Domain.readOne({ isDefault: true }) || await DL.Domain.readOne({})
        if (!domain?.id)
            throw { status: 400, message: 'no domain configured' }

        await DL.Setting.create({
            key: SALES_WINDOW_KEY,
            value: config,
            domainId: domain.id,
            category: 'system',
            subCategory: 'product',
            formType: 'config',
            renderType: 'config',
            hidden: true
        })
    }

    return { ...config, departments }
}

update.config = {
    permissions: ['comax_product:update']
}
