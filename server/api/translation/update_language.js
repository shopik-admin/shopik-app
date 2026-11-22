import diff from '#common/functions/diff.js'
import { BASE_LANGUAGE_CODE } from '#common/constants/translations.js'
import { invalidateTranslations } from '#server/utils/texts/dictionary.js'
import { direction } from '#server/utils/texts/validate.js'

export default async function updateLanguage(payload, { DL }) {
    const { id } = payload
    const language = await DL.TranslationLanguage.readById(id)
    if (!language)
        throw { status: 400, message: 'language does not exist' }
    if (language.code === BASE_LANGUAGE_CODE)
        throw { status: 400, message: 'the base language cannot be edited' }

    const update = diff(language, payload)
    delete update.id
    delete update.code
    delete update.active
    delete update.domainId
    delete update.createdAt
    delete update.updatedAt

    if (update.name !== undefined) {
        update.name = String(update.name || '').trim()
        if (!update.name)
            throw { status: 400, message: 'language name is required' }
    }
    if (update.nativeName !== undefined) {
        update.nativeName = String(update.nativeName || '').trim()
        if (!update.nativeName)
            throw { status: 400, message: 'native language name is required' }
    }
    if (update.direction !== undefined)
        update.direction = direction(update.direction)
    if (update.flag !== undefined)
        update.flag = String(update.flag || '').trim()

    if (!Object.keys(update).length)
        return language

    const updated = await DL.TranslationLanguage.updateOne({ id }, update)
    await invalidateTranslations(DL)
    return updated
}

updateLanguage.config = {
    required: ['id'],
    permissions: ['text:update']
}
