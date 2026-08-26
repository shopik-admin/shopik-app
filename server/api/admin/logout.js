import { ADMIN_TOKEN_COOKIE } from '#common/constants.js'

export default async function logout(payload, { DL, _admin, platform, clearCookie }) {
    await DL.Admin.Model.updateOne(
        { id: _admin.id },
        {
            $set: { lastLogout: new Date() },
            $unset: { [`tokens.${platform}`]: '' }
        }
    )
    await DL.redis?.del(`admin_auth:${_admin.id}`)
    clearCookie(ADMIN_TOKEN_COOKIE)
    return true
}

logout.config = { auth: 'required' }
