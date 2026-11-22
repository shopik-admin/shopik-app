import { BASE_LANGUAGE_CODE } from '#common/constants/translations.js'
import {
    baseDictionary,
    getLanguages,
    readLanguage,
    replaceTranslations
} from '#server/utils/texts/dictionary.js'
import { languageCode as requireLanguageCode } from '#server/utils/texts/validate.js'
import { MAX_FILE_BYTES, parseTranslationFile } from '#server/utils/texts/spreadsheet.js'

export default async function importTranslations(payload, { DL, _admin }) {
    // Import performs both creates and updates; enforce strict AND like the
    // settings import route (router permission arrays are OR).
    if (!_admin?.hasPermission?.('text:create') || !_admin?.hasPermission?.('text:update'))
        throw { status: 403, message: 'Forbidden' }

    const code = requireLanguageCode(payload.languageCode)
    const language = await readLanguage(DL, code)
    if (!language)
        throw { status: 400, message: 'language does not exist' }

    const filename = String(payload.filename || '').trim()
    if (!filename)
        throw { status: 400, message: 'filename is required' }
    if (typeof payload.fileBase64 !== 'string' || !payload.fileBase64)
        throw { status: 400, message: 'file is required' }

    const buffer = Buffer.from(payload.fileBase64, 'base64')
    if (buffer.length > MAX_FILE_BYTES)
        throw { status: 400, message: 'file is larger than 5MB' }

    const languages = await getLanguages(DL)
    const parsed = await parseTranslationFile({
        buffer,
        filename,
        languageCode: code,
        languages
    })

    let skipped = parsed.skipped
    const updates = { ...parsed.updates }

    // A Hebrew row equal to the bundled value is not an override; keeping it
    // would turn every exported row into a DB document on the first import.
    if (code === BASE_LANGUAGE_CODE) {
        const base = baseDictionary()
        for (const [key, value] of Object.entries(updates)) {
            if (base[key] === value) {
                delete updates[key]
                skipped++
            }
        }
    }

    if (!Object.keys(updates).length) {
        return {
            languageCode: code,
            rows: parsed.rows,
            updated: 0,
            skipped,
            errors: parsed.errors
        }
    }

    await replaceTranslations(DL, code, updates)
    return {
        languageCode: code,
        rows: parsed.rows,
        updated: Object.keys(updates).length,
        skipped,
        errors: parsed.errors
    }
}

importTranslations.config = {
    required: ['fileBase64', 'filename', 'languageCode'],
    permissions: ['text:create', 'text:update']
}
