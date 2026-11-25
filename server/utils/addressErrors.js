/**
 * Address error contract.
 *
 * `code`    — stable machine identifier (UPPER_SNAKE) for clients to branch on.
 * `message` — the i18n key in common/texts/hebrew.json; the client translates it.
 *
 * Every address route throws these instead of ad-hoc objects so the same
 * condition looks the same on the storefront, the admin and the bot.
 */

export const addressNotFoundError = (overrides = {}) => ({
    status: 422,
    code: 'ADDRESS_NOT_FOUND',
    message: 'address_not_found',
    ...overrides
})

export const addressRecordNotFoundError = (overrides = {}) => ({
    status: 404,
    code: 'ADDRESS_RECORD_NOT_FOUND',
    message: 'address_record_not_found',
    ...overrides
})

export const addressNoServiceError = (overrides = {}) => ({
    status: 400,
    code: 'ADDRESS_NO_SERVICE',
    message: 'no_service',
    ...overrides
})

export const elevatorRequiredError = (overrides = {}) => ({
    status: 400,
    code: 'ELEVATOR_REQUIRED',
    field: 'hasElevator',
    message: 'address_elevator_required',
    ...overrides
})
