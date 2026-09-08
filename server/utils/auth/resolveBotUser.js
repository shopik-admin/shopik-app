/**
 * Resolve a bot-verified user from a userToken (issued by bot/otp_verify)
 * or a plain phone number. Used by all bot/* endpoints that need a user.
 * Throws { status: 401/403 } on failure.
 */
export default async function resolveBotUser({ DL, utils, domainId, userToken, phone }) {
    if (userToken) {
        let decoded
        try {
            decoded = utils.auth.verifyToken(userToken)
        } catch {
            throw { status: 401, message: 'Invalid user token' }
        }
        const user = await DL.User.readById(decoded.id)
        if (!user) throw { status: 401, message: 'User not found' }
        if (domainId && user.domainId && String(user.domainId) !== String(domainId))
            throw { status: 403, message: 'User belongs to a different domain' }
        return user
    }
    if (phone) {
        const filter = domainId ? { domainId, phone } : { phone }
        const user = await DL.User.readOne(filter)
        if (!user) throw { status: 404, message: 'User not found' }
        return user
    }
    throw { status: 400, message: 'userToken or phone required' }
}
