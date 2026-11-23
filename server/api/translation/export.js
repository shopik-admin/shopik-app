import { BASE_LANGUAGE_CODE } from '#common/constants/translations.js'
import { getTranslationRows } from '#server/utils/texts/dictionary.js'
import { buildTranslationFile } from '#server/utils/texts/spreadsheet.js'

export default async function exportTranslations(payload, { DL }) {
    const allLanguages = !!payload.allLanguages
    const format = payload.format === 'csv' ? 'csv' : 'xlsx'
    const rows = await getTranslationRows(DL)
    const code = rows.languages.some(language => language.code === payload.code)
        ? payload.code
        : BASE_LANGUAGE_CODE

    const file = await buildTranslationFile({
        entries: rows.entries,
        languages: rows.languages,
        code,
        allLanguages,
        format
    })

    return {
        filename: file.filename,
        contentType: file.contentType,
        fileBase64: file.buffer.toString('base64')
    }
}

exportTranslations.config = {
    permissions: ['text:read']
}
