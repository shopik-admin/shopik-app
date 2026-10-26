/**
 * Read-only VAT report for accountant sign-off.
 *
 * Lists every product classified as exempt (vat=false) grouped by its Comax
 * category, plus products that never received the field (legacy docs resolve as
 * taxable at invoice time). No writes.
 *
 * Usage: node server/scripts/runReportProductVat.js [--json]
 */
import log from '#server/utils/log.js'

export default async function reportProductVat({ DL } = {}, { json = false } = {}) {
    if (!DL?.Product) throw new Error('DL required')

    const select = { _id: 0, id: 1, barcode: 1, name: 1, vat: 1, 'category.title': 1 }
    const [exempt, missing] = await Promise.all([
        DL.Product.read({ vat: false }, select, { limit: 0 }),
        DL.Product.read({ vat: { $exists: false } }, select, { limit: 0 })
    ])

    const byDepartment = new Map()
    for (const product of exempt || []) {
        const key = product.category?.title || '(ללא קטגוריה)'
        if (!byDepartment.has(key)) byDepartment.set(key, [])
        byDepartment.get(key).push(product)
    }

    const departments = [...byDepartment.entries()]
        .map(([title, products]) => ({ title, count: products.length, products }))
        .sort((a, b) => b.count - a.count)

    const report = {
        exemptCount: (exempt || []).length,
        missingFieldCount: (missing || []).length,
        departments,
        missing: missing || []
    }

    if (json) return report

    log.info(`[reportProductVat] exempt products: ${report.exemptCount}`)
    for (const dept of departments) {
        log.info(`  ${dept.title} — ${dept.count}`)
        for (const product of dept.products.slice(0, 20))
            console.log(`    ${product.barcode}  ${product.name}`)
        if (dept.products.length > 20) console.log(`    ... ${dept.products.length - 20} more`)
    }
    if (report.missingFieldCount) {
        log.warn(`[reportProductVat] products without vat field (treated as taxable): ${report.missingFieldCount}`)
        for (const product of report.missing.slice(0, 20))
            console.log(`    ${product.barcode}  ${product.name}`)
    }
    return report
}
