import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import apiReq from '../../common/functions/apiReq.js'
import TR from '../../common/texts/TR.js'
import {
    addressNoServiceError,
    addressNotFoundError,
    addressRecordNotFoundError,
    elevatorRequiredError
} from '../../server/utils/addressErrors.js'

const realFetch = globalThis.fetch
const realVersion = globalThis.APP_VERSION

afterEach(() => {
    globalThis.fetch = realFetch
    globalThis.APP_VERSION = realVersion
})

describe('address error contract', () => {
    it('gives every address error a machine code and an existing i18n key', () => {
        const errors = [
            addressNotFoundError(),
            addressRecordNotFoundError(),
            addressNoServiceError(),
            elevatorRequiredError()
        ]
        for (const error of errors) {
            assert.match(error.code, /^[A-Z][A-Z_]*$/)
            assert.match(error.message, /^[a-z][a-z_]*$/)
            assert.notEqual(TR(error.message), error.message, `missing Hebrew text for ${error.message}`)
        }
    })

    it('translates the server message in apiReq and keeps the code', async () => {
        globalThis.APP_VERSION = 'test'
        globalThis.fetch = async () => ({
            ok: false,
            status: 422,
            json: async () => ({ status: 422, ...addressNotFoundError() })
        })

        await assert.rejects(
            () => apiReq('address/validate', {}),
            error => error.code === 'ADDRESS_NOT_FOUND' &&
                error.message === TR('address_not_found') &&
                error.message !== 'address_not_found'
        )
    })

    it('keeps structured fields on translated errors', async () => {
        globalThis.APP_VERSION = 'test'
        globalThis.fetch = async () => ({
            ok: false,
            status: 400,
            json: async () => ({ status: 400, ...elevatorRequiredError({ missingFields: ['address'] }) })
        })

        await assert.rejects(
            () => apiReq('payment/create', {}),
            error => error.code === 'ELEVATOR_REQUIRED' &&
                error.message === TR('address_elevator_required') &&
                Array.isArray(error.missingFields) &&
                error.missingFields[0] === 'address'
        )
    })
})
