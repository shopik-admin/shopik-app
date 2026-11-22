import { removeTranslation } from '#server/utils/texts/dictionary.js'
import { languageCode, translationKey } from '#server/utils/texts/validate.js'

export default async function remove(payload, { DL }) {
    const code = languageCode(payload.languageCode)
    const key = translationKey(payload.key)
    const result = await removeTranslation(DL, { languageCode: code, key })
    if (!result.removed)
        throw { status: 404, message: 'text does not exist' }
    return result
}

remove.config = {
    required: ['languageCode', 'key'],
    permissions: ['text:delete']
}
