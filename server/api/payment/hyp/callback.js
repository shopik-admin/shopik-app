function buildHtml({ ok, title, message, href, btnText }) {
    const safeTitle = String(title).replace(/</g, '&lt;')
    const safeMsg = String(message).replace(/</g, '&lt;')
    return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Heebo,Arial,sans-serif;max-width:560px;margin:40px auto;padding:24px;text-align:center;line-height:1.6;color:#111}h1{font-size:22px;margin:0 0 12px} p{color:#444;margin:0 0 16px} .btn{display:inline-block;margin-top:16px;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:10px;font-weight:600} .muted{font-size:13px;color:#888;margin-top:20px}</style></head><body><h1>${safeTitle}</h1><p>${safeMsg}</p><a class="btn" href="${href}">${btnText}</a><div class="muted">${ok ? 'החיוב יתבצע בעת הכנת המשלוח' : ''}</div></body></html>`
}

export default async function callback(payload, info) {
    const { DL, external, utils, query, req, res } = info
    const q = query || {}
    // raw query string preserving original order for VERIFY
    let rawQueryString = ''
    try {
        const url = req?.originalUrl || req?.url || ''
        const idx = url.indexOf('?')
        if (idx !== -1) rawQueryString = url.slice(idx + 1)
    } catch { }
    if (!rawQueryString) rawQueryString = new URLSearchParams(q).toString()

    const hyp = external.hyp
    const orderNumber = q.Order || q.order
    const providerTxnId = q.Id || q.id
    const ccodeRaw = q.CCode ?? q.Ccode ?? q.ccode
    const providerCode = ccodeRaw !== undefined ? Number(ccodeRaw) : undefined
    const amountRaw = q.Amount

    // Helper to send simple HTML (not SPA, not JSON)
    function sendHtml({ ok, order, errorMessage }) {
        const html = ok
            ? buildHtml({ ok: true, title: 'התשלום אושר', message: 'ההזמנה התקבלה בהצלחה.', href: order?.id ? `/account/orders/${order.id}` : '/account/orders', btnText: 'לצפייה בהזמנה' })
            : buildHtml({ ok: false, title: 'שגיאת תשלום', message: errorMessage || 'אימות התשלום נכשל. ניתן לנסות שוב.', href: order?.id ? `/checkout/${order.id}` : '/', btnText: 'חזרה' })
        res.status(ok ? 200 : 400).type('html').send(html)
    }

    // 1. VERIFY
    let verify
    try {
        verify = await hyp.verifyRedirect({ query: q, rawQueryString })
    } catch (e) {
        try {
            const orderFallback = orderNumber ? await DL.Order.readOne({ number: String(orderNumber) }) : null
            const { record } = utils.data.timeline
            if (orderFallback?.id) {
                await record({
                    DL,
                    order: orderFallback,
                    eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
                    actor: null,
                    context: { step: 'payment_failed', provider: 'hyp', providerCode, providerTxnId, amount: amountRaw ? Number(amountRaw) : undefined, orderNumber },
                    outcome: { success: false, errorMessage: e.message || 'VERIFY failed' },
                    metadata: { source: 'payment/hyp/callback', referenceOrderNumber: orderFallback.number }
                })
            }
        } catch { }
        sendHtml({ ok: false, order: null, errorMessage: 'אימות התשלום נכשל' })
        return
    }

    if (!verify || Number(verify.CCode) !== 0) {
        const msg = hyp.ccodeMessage(verify?.CCode ?? providerCode)
        try {
            const orderFallback = orderNumber ? await DL.Order.readOne({ number: String(orderNumber) }) : null
            if (orderFallback?.id) {
                const { record } = utils.data.timeline
                await record({
                    DL, order: orderFallback,
                    eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
                    actor: null,
                    context: { step: 'payment_failed', provider: 'hyp', providerCode: verify?.CCode ?? providerCode, providerTxnId, amount: amountRaw ? Number(amountRaw) : undefined, orderNumber },
                    outcome: { success: false, errorMessage: msg },
                    metadata: { source: 'payment/hyp/callback' }
                })
            }
        } catch { }
        sendHtml({ ok: false, order: null, errorMessage: msg })
        return
    }

    // 2. Lookup order
    if (!orderNumber) {
        sendHtml({ ok: false, order: null, errorMessage: 'חסר מספר הזמנה' })
        return
    }
    const order = await DL.Order.readOne({ number: String(orderNumber) })
    if (!order) {
        res.status(404).type('html').send(buildHtml({ ok: false, title: 'הזמנה לא נמצאה', message: 'ההזמנה לא נמצאה במערכת.', href: '/', btnText: 'לדף הבית' }))
        return
    }

    // 3. Idempotency — same providerTxnId already processed
    if (providerTxnId) {
        const existing = await DL.PaymentTransaction.readOne({ providerTxnId: String(providerTxnId) })
        if (existing) {
            const isSuccess = existing.status === DL.PaymentTransaction.constants.TRANSACTION_STATUS.SUCCESS
            sendHtml({ ok: isSuccess, order, errorMessage: existing.error })
            return
        }
    }

    // 4. Handle CCode from redirect: {0,700} success
    const isSuccessCode = providerCode === 0 || providerCode === 700
    if (!isSuccessCode) {
        const msg = hyp.ccodeMessage(providerCode)
        try {
            await DL.PaymentTransaction.create({
                domainId: order.domainId, storeId: order.storeId,
                orderId: order.id, orderNumber: order.number, userId: order.userId,
                provider: 'hyp', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.AUTH,
                status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.FAILED,
                amount: amountRaw ? Number(amountRaw) : undefined,
                providerTxnId: providerTxnId ? String(providerTxnId) : undefined,
                providerCode, authCode: q.ACode || q.acode, providerUid: q.UID, providerPayerId: q.UserId, signature: q.Sign, providerData: q, error: msg
            })
        } catch { }
        try {
            const { record } = utils.data.timeline
            await record({
                DL, order,
                eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
                actor: null,
                context: { step: 'payment_failed', provider: 'hyp', providerCode, providerTxnId, amount: amountRaw ? Number(amountRaw) : undefined, orderNumber },
                outcome: { success: false, errorMessage: msg },
                metadata: { source: 'payment/hyp/callback' }
            })
        } catch { }
        await DL.Order.updateOne({ id: order.id }, { paymentError: msg }).catch(() => { })
        sendHtml({ ok: false, order, errorMessage: msg })
        return
    }

    // 5. Success → getToken
    let tokenData
    try {
        tokenData = await hyp.getToken(String(providerTxnId))
    } catch (e) {
        const msg = e.message || 'getToken failed'
        try {
            await DL.PaymentTransaction.create({
                domainId: order.domainId, storeId: order.storeId,
                orderId: order.id, orderNumber: order.number, userId: order.userId,
                provider: 'hyp', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.AUTH,
                status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.FAILED,
                amount: amountRaw ? Number(amountRaw) : undefined,
                providerTxnId: String(providerTxnId), providerCode, authCode: q.ACode, providerUid: q.UID, providerPayerId: q.UserId, signature: q.Sign, providerData: { ...q, tokenError: msg }, error: msg
            })
        } catch { }
        sendHtml({ ok: false, order, errorMessage: msg })
        return
    }

    if (Number(tokenData.CCode) !== 0 || !tokenData.Token) {
        const msg = hyp.ccodeMessage(tokenData.CCode)
        try {
            await DL.PaymentTransaction.create({
                domainId: order.domainId, storeId: order.storeId,
                orderId: order.id, orderNumber: order.number, userId: order.userId,
                provider: 'hyp', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.AUTH,
                status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.FAILED,
                amount: amountRaw ? Number(amountRaw) : undefined,
                providerTxnId: String(providerTxnId), providerCode: tokenData.CCode, authCode: q.ACode, providerUid: q.UID, providerPayerId: q.UserId, signature: q.Sign,
                cardToken: tokenData.Token, cardExpiry: tokenData.Tokef, providerData: { ...q, tokenResponse: tokenData }, error: msg
            })
        } catch { }
        sendHtml({ ok: false, order, errorMessage: msg })
        return
    }

    // 6. Persist auth success
    const cardToken = tokenData.Token
    const cardExpiry = tokenData.Tokef
    const authorizedAmount = amountRaw ? Number(amountRaw) : order.finalSumWithShipping ?? order.finalSum
    const last4digits = q.L4digit ? String(q.L4digit) : undefined
    const cardCompany = hyp.cardBrandName(q.Brand)

    try {
        await DL.PaymentTransaction.create({
            domainId: order.domainId, storeId: order.storeId,
            orderId: order.id, orderNumber: order.number, userId: order.userId,
            provider: 'hyp', kind: DL.PaymentTransaction.constants.TRANSACTION_KIND.AUTH,
            status: DL.PaymentTransaction.constants.TRANSACTION_STATUS.SUCCESS,
            amount: Number(authorizedAmount),
            terminalId: process.env.HYP_MASOF || undefined,
            providerTxnId: String(providerTxnId), providerCode, authCode: q.ACode, providerUid: q.UID, providerPayerId: q.UserId, signature: q.Sign,
            cardToken, cardExpiry, last4digits, cardCompany, providerData: { ...q, tokenResponse: tokenData }
        })
    } catch { }

    try {
        await DL.Order.updateOne({ id: order.id }, {
            status: DL.Order.constants.ORDER_STATUS.PAID,
            payment: {
                provider: 'hyp',
                providerTxnId: String(providerTxnId),
                authCode: q.ACode ? String(q.ACode) : undefined,
                providerUid: q.UID ? String(q.UID) : undefined,
                providerPayerId: q.UserId ? String(q.UserId) : undefined,
                cardToken, cardExpiry,
                last4digits, cardCompany,
                terminalId: process.env.HYP_MASOF || undefined,
                authorizedAmount: Number(authorizedAmount)
            },
            paymentError: null
        })
    } catch { }

    try {
        const { record } = utils.data.timeline
        await record({
            DL, order,
            eventType: DL.Timeline.constants.EVENT_TYPES.PAYMENT,
            actor: null,
            context: { step: 'payment_authorized', provider: 'hyp', providerTxnId: String(providerTxnId), authCode: q.ACode, providerUid: q.UID, amount: Number(authorizedAmount), last4digits, cardCompany, orderNumber },
            outcome: { success: true },
            metadata: { source: 'payment/hyp/callback', referenceOrderNumber: order.number }
        })
    } catch { }

    sendHtml({ ok: true, order })
}

callback.config = {
    auth: 'none',
    log: true
}
