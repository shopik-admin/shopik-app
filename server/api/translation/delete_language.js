import { BASE_LANGUAGE_CODE } from '#common/constants/translations.js'
import { invalidateTranslations } from '#server/utils/texts/dictionary.js'

export default async function deleteLanguage(payload, { DL }) {
    const { id } = payload
    const language = await DL.TranslationLanguage.readById(id)
    if (!language)
        throw { status: 400, message: 'language does not exist' }
    if (language.code === BASE_LANGUAGE_CODE)
        throw { status: 400, message: 'the base language cannot be deleted' }

    const deletedTexts = await DL.TranslationDictionary.Model.countDocuments({ languageCode: language.code })
    if (deletedTexts)
        await DL.TranslationDictionary.Model.deleteMany({ languageCode: language.code })

    await DL.TranslationLanguage.deleteOne({ id })
    await invalidateTranslations(DL)

    return { id, code: language.code, deletedTexts }
}

deleteLanguage.config = {
    required: ['id'],
    permissions: ['text:delete']
}
