import { BASE_LANGUAGE_CODE, isValidLanguageCode, normalizeLanguageCode } from '#common/constants/translations.js'
import { direction } from '#server/utils/texts/validate.js'
import { invalidateTranslations } from '#server/utils/texts/dictionary.js'

export default async function createLanguage(payload, { DL }) {
    const code = normalizeLanguageCode(payload.code)
    if (!code || !isValidLanguageCode(code))
        throw { status: 400, message: 'invalid language code' }
    if (code === BASE_LANGUAGE_CODE)
        throw { status: 400, message: 'the base language already exists' }

    const name = String(payload.name || '').trim()
    if (!name)
        throw { status: 400, message: 'language name is required' }

    const existing = await DL.TranslationLanguage.readOne({ code }, { _id: 0, id: 1 })
    if (existing)
        throw { status: 409, message: 'language already exists' }

    const created = await DL.TranslationLanguage.create({
        code,
        name,
        nativeName: String(payload.nativeName || name).trim() || name,
        direction: direction(payload.direction),
        flag: String(payload.flag || '').trim()
    })

    await invalidateTranslations(DL)
    return created
}

createLanguage.config = {
    required: ['code', 'name'],
    permissions: ['text:create']
}
