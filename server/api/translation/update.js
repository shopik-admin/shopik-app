import { readLanguage, setTranslation } from '#server/utils/texts/dictionary.js'
import { languageCode, translationKey, translationValue } from '#server/utils/texts/validate.js'

export default async function update(payload, { DL }) {
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
    if (!existing?.texts || !Object.prototype.hasOwnProperty.call(existing.texts, key))
        throw { status: 404, message: 'text does not exist' }

    return setTranslation(DL, { languageCode: code, key, value })
}

update.config = {
    required: ['languageCode', 'key', 'value'],
    permissions: ['text:update']
}
