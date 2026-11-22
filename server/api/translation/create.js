import { readLanguage, setTranslation } from '#server/utils/texts/dictionary.js'
import { languageCode, translationKey, translationValue } from '#server/utils/texts/validate.js'

export default async function create(payload, { DL }) {
    const code = languageCode(payload.languageCode)
    const key = translationKey(payload.key)
    const value = translationValue(payload.value)

    const language = await readLanguage(DL, code)
    if (!language)
        throw { status: 400, message: 'language does not exist' }

    const existing = await DL.TranslationDictionary.readOne(
        { languageCode: code },
        { _id: 0, texts: 1 }
    )
    if (existing?.texts && Object.prototype.hasOwnProperty.call(existing.texts, key))
        throw { status: 409, message: 'text already exists' }

    return setTranslation(DL, { languageCode: code, key, value })
}

create.config = {
    required: ['languageCode', 'key', 'value'],
    permissions: ['text:create']
}
