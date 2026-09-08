// Single-issuance invoice docs (Hyp PrintHesh links).
// Best-effort by design: generation must never fail payment flows —
// a missing link simply means payment/invoice retries on first click.

export async function generateInvoiceUrl({ external, providerTxnId }) {
    if (!providerTxnId) return null
    try {
        const url = await external?.hyp?.invoiceLink?.(String(providerTxnId))
        return typeof url === 'string' && url ? url : null
    } catch {
        return null
    }
}

// Generate the link for a transaction and attach it to its ledger row.
// Returns the url or null. Never throws.
export async function attachInvoiceUrl({ DL, external, providerTxnId }) {
    const url = await generateInvoiceUrl({ external, providerTxnId }).catch(() => null)
    if (!url) return null
    try {
        await DL.PaymentTransaction.Model.updateOne(
            { providerTxnId: String(providerTxnId) },
            { invoiceUrl: url }
        )
    } catch { }
    return url
}
