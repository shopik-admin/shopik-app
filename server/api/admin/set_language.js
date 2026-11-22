import { BASE_LANGUAGE_CODE } from '#common/constants/translations.js'
import { redisDel } from '#server/utils/redisSafe.js'
import { readLanguage } from '#server/utils/texts/dictionary.js'
import { languageCode } from '#server/utils/texts/validate.js'

export default async function setLanguage(payload, { DL, _admin }) {
    if (!_admin?.id || _admin.isApiKey)
        throw { status: 403, message: 'Forbidden' }

    const code = languageCode(payload.languageCode)
    if (code !== BASE_LANGUAGE_CODE) {
        const language = await readLanguage(DL, code)
        if (!language)
            throw { status: 400, message: 'language does not exist' }
    }

    await DL.Admin.updateOne({ id: _admin.id }, { languageCode: code })
    // The auth payload is cached for 24h; drop it so the next request (and the
    // login reload) sees the new preference.
    await redisDel(DL.redis, `admin_auth:${_admin.id}`)

    return { languageCode: code }
}

setLanguage.config = {
    required: ['languageCode']
}
