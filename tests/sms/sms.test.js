import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import sms, { buildSmsBody, formatOtpMessage } from '../../server/external/sms/index.js'
import { DEFAULT_VOICE, getSmsConfig } from '../../server/external/sms/config.js'

const PHONE = '0501234567'

function createDl(value = {}) {
    const logs = []
    const DL = {
        Setting: { readOne: async () => ({ value }) },
        Log: {
            constants: { DIRECTION: { OUT: 'out' }, ACTOR: { API: 'api' } },
            start: data => ({
                data,
                actor() { },
                async success(payload) { logs.push({ ok: true, ...payload }) },
                async error(payload) { logs.push({ ok: false, ...payload }) }
            })
        }
    }
    return { DL, logs }
}

function stubFetch(response = {}) {
    const original = globalThis.fetch
    const calls = []
    const body = { status: 0, message: 'SMS will be sent', shipment_id: '777', ...response }
    globalThis.fetch = async (url, init) => {
        calls.push({ url, headers: init.headers, body: JSON.parse(init.body) })
        return { status: 200, text: async () => JSON.stringify(body) }
    }
    return { calls, restore: () => { globalThis.fetch = original } }
}

describe('buildSmsBody', () => {
    it('keeps the plain SMS shape when there is no tts block', () => {
        const body = buildSmsBody({ username: 'u', source: 'Shopik', phones: [PHONE], message: 'hi' })
        assert.deepEqual(body, {
            sms: {
                user: { username: 'u' },
                source: 'Shopik',
                destinations: { phone: PHONE },
                message: 'hi'
            }
        })
        assert.equal('tts' in body.sms, false)
    })

    it('adds the tts block inside the same sms object', () => {
        const tts = { type: 2, voice: 'ymMale', repeat: 2, rate: 0 }
        const body = buildSmsBody({ username: 'u', source: 'Shopik', phones: [PHONE], message: 'hi', tts })
        assert.deepEqual(body.sms.tts, tts)
        assert.equal(body.sms.destinations.phone, PHONE)
    })
})

describe('formatOtpMessage', () => {
    it('spaces the digits so TTS reads them one by one', () => {
        assert.equal(
            formatOtpMessage('482913'),
            'קוד האימות שלך הוא 4 8 2 9 1 3. הקוד תקף ל-10 דקות.'
        )
    })

    it('strips non-digits', () => {
        assert.equal(
            formatOtpMessage(' 12-34 '),
            'קוד האימות שלך הוא 1 2 3 4. הקוד תקף ל-10 דקות.'
        )
    })
})

describe('getSmsConfig voice', () => {
    it('defaults to disabled with 019 defaults', async () => {
        const { DL } = createDl({})
        const cfg = await getSmsConfig(DL, 'd1')
        assert.deepEqual(cfg.voice, DEFAULT_VOICE)
        assert.equal(DEFAULT_VOICE.enabled, false)
    })

    it('reads the VOICE block and clamps values', async () => {
        const { DL } = createDl({
            VOICE: { enabled: true, type: 3, voice: 'ymFemale', repeat: 9, rate: -40 }
        })
        const cfg = await getSmsConfig(DL, 'd1')
        assert.deepEqual(cfg.voice, { enabled: true, type: 3, voice: 'ymFemale', repeat: 5, rate: -10 })
    })

    it('falls back to type 2 for an unknown type', async () => {
        const { DL } = createDl({ VOICE: { enabled: 'true', type: 9 } })
        const cfg = await getSmsConfig(DL, 'd1')
        assert.equal(cfg.voice.enabled, true)
        assert.equal(cfg.voice.type, 2)
    })
})

describe('sms.otp voice routing', () => {
    it('sends a plain SMS when the domain has voice disabled', async t => {
        const fetchStub = stubFetch()
        t.after(fetchStub.restore)
        const { DL } = createDl({ TOKEN_019: 't', USERNAME_019: 'u' })
        const external = sms({ DL })

        await external.otp(PHONE, '482913', { domainId: 'd1', voice: true })

        assert.equal(fetchStub.calls.length, 1)
        assert.equal('tts' in fetchStub.calls[0].body.sms, false)
        assert.match(fetchStub.calls[0].body.sms.message, /4 8 2 9 1 3/)
    })

    it('adds tts type 2 when the domain has voice enabled', async t => {
        const fetchStub = stubFetch()
        t.after(fetchStub.restore)
        const { DL } = createDl({
            TOKEN_019: 't',
            USERNAME_019: 'u',
            VOICE: { enabled: true, type: 2, voice: 'ymMale', repeat: 2, rate: 0 }
        })
        const external = sms({ DL })

        await external.otp(PHONE, '482913', { domainId: 'd1', voice: true })

        assert.deepEqual(fetchStub.calls[0].body.sms.tts, { type: 2, voice: 'ymMale', repeat: 2, rate: 0 })
        assert.equal(fetchStub.calls[0].body.sms.destinations.phone, PHONE)
    })

    it('does not attach tts when the caller does not ask for voice', async t => {
        const fetchStub = stubFetch()
        t.after(fetchStub.restore)
        const { DL } = createDl({ TOKEN_019: 't', USERNAME_019: 'u', VOICE: { enabled: true } })
        const external = sms({ DL })

        await external.otp(PHONE, '482913', { domainId: 'd1' })

        assert.equal('tts' in fetchStub.calls[0].body.sms, false)
    })

    it('lets an explicit override bypass the enabled gate (admin dev tool)', async t => {
        const fetchStub = stubFetch()
        t.after(fetchStub.restore)
        const { DL } = createDl({ TOKEN_019: 't', USERNAME_019: 'u' })
        const external = sms({ DL })

        await external.send([PHONE], 'test', { domainId: 'd1', voice: { type: 4, repeat: 1 } })

        assert.deepEqual(fetchStub.calls[0].body.sms.tts, { type: 4, voice: 'ymMale', repeat: 1, rate: 0 })
    })

    it('logs the channel so voice sends are traceable', async t => {
        const fetchStub = stubFetch()
        t.after(fetchStub.restore)
        const { DL, logs } = createDl({
            TOKEN_019: 't',
            USERNAME_019: 'u',
            VOICE: { enabled: true }
        })
        const external = sms({ DL })

        await external.otp(PHONE, '482913', { domainId: 'd1', voice: true })

        assert.equal(logs.at(-1).channel, 'sms+voice')
    })

    it('still rejects an invalid phone before calling the provider', async () => {
        const { DL } = createDl({ TOKEN_019: 't', USERNAME_019: 'u' })
        const external = sms({ DL })
        await assert.rejects(() => external.otp('123', '482913', { domainId: 'd1', voice: true }), /Invalid phone/)
    })

    it('accepts a bare domainId string as opts (backward compat)', async t => {
        const fetchStub = stubFetch()
        t.after(fetchStub.restore)
        const { DL } = createDl({ TOKEN_019: 't', USERNAME_019: 'u', VOICE: { enabled: true } })
        const external = sms({ DL })

        await external.send([PHONE], 'hi', 'd1')

        assert.equal('tts' in fetchStub.calls[0].body.sms, false)
    })
})
