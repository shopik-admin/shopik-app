/**
 * POST /api/sms/voice_test
 * Admin-only probe for 019 TTS: sends one message to one phone so we can hear
 * how the voice call sounds before enabling voice OTP for a domain.
 *
 * type 4 (default) = call only — use it to test any number.
 * type 2 = SMS to regular phones, call to kosher phones.
 * type 3 = both, to every number.
 */

const TYPES = [2, 3, 4]

export default async function voice_test(payload, { DL, external }) {
    const { phone, message } = payload || {}
    const type = TYPES.includes(Number(payload?.type)) ? Number(payload.type) : 4

    const normalized = external.sms._normalizePhone(phone)
    if (!/^0?5\d{8}$/.test(normalized)) throw { status: 400, message: 'Invalid phone' }
    if (String(message).length > 1005) throw { status: 400, message: 'Message too long (max 1005 characters)' }

    let domainId = payload?.domainId
    if (!domainId) {
        const domain = await DL.Domain.readOne({ isDefault: true, active: true }, { _id: 0, id: 1 }).catch(() => null)
        domainId = domain?.id
    }
    if (!domainId) throw { status: 400, message: 'No domain: pass domainId or set a default domain' }

    const override = { type }
    if (payload?.voice) override.voice = payload.voice
    if (payload?.repeat != null && payload.repeat !== '') override.repeat = payload.repeat
    if (payload?.rate != null && payload.rate !== '') override.rate = payload.rate

    const result = await external.sms.send([phone], message, { domainId, voice: override })

    return {
        domainId,
        type,
        tts: { type, voice: override.voice, repeat: override.repeat, rate: override.rate },
        shipmentId: result?.shipment_id ?? null,
        providerMessage: result?.message ?? null,
        stubbed: result?.stubbed === true
    }
}

voice_test.config = {
    auth: 'required',
    permissions: ['admin:super'],
    required: ['phone', 'message'],
    preventMultiple: true
}
