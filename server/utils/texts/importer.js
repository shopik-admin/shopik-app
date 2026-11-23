import { BASE_LANGUAGE_CODE } from '#common/constants/translations.js'
import {
    baseDictionary,
    getLanguages,
    readLanguage,
    replaceTranslations
} from '#server/utils/texts/dictionary.js'
import { languageCode as requireLanguageCode } from '#server/utils/texts/validate.js'
import { MAX_FILE_BYTES, parseTranslationFile } from '#server/utils/texts/spreadsheet.js'

const PREVIEW_SAMPLE = 20

export async function prepareTranslationImport(DL, payload = {}) {
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

    const [languages, current] = await Promise.all([
        getLanguages(DL),
        DL.TranslationDictionary.readOne(
            { languageCode: code },
            { _id: 0, texts: 1 }
        ).catch(() => null)
    ])
    const parsed = await parseTranslationFile({
        buffer,
        filename,
        languageCode: code,
        languages
    })

    const currentTexts = current?.texts && typeof current.texts === 'object' ? current.texts : {}
    const base = code === BASE_LANGUAGE_CODE ? baseDictionary() : null
    let skipped = parsed.skipped
    const updates = {}

    // Only rows whose value actually changes are "updates". An exported file
    // contains every existing value, so comparing the file against the
    // dictionary is what makes a one-cell edit show up as one update, not as
    // the whole sheet.
    for (const [key, value] of Object.entries(parsed.updates)) {
        if (currentTexts[key] === value) {
            skipped++
            continue
        }
        // A Hebrew row equal to the bundled value is not an override; keeping
        // it would turn every exported row into a DB document.
        if (base && !currentTexts[key] && base[key] === value) {
            skipped++
            continue
        }
        updates[key] = value
    }

    return {
        code,
        language,
        filename,
        rows: parsed.rows,
        updates,
        skipped,
        errors: parsed.errors
    }
}

export function importPreviewPayload(prepared) {
    return {
        languageCode: prepared.code,
        languageName: prepared.language.nativeName || prepared.language.name || prepared.code,
        filename: prepared.filename,
        rows: prepared.rows,
        updates: Object.keys(prepared.updates).length,
        skipped: prepared.skipped,
        errors: prepared.errors,
        sample: Object.entries(prepared.updates)
            .slice(0, PREVIEW_SAMPLE)
            .map(([key, value]) => ({ key, value }))
    }
}

export async function applyTranslationImport(DL, payload) {
    const prepared = await prepareTranslationImport(DL, payload)
    const keys = Object.keys(prepared.updates)

    if (!keys.length) {
        return {
            languageCode: prepared.code,
            rows: prepared.rows,
            updated: 0,
            skipped: prepared.skipped,
            errors: prepared.errors
        }
    }

    await replaceTranslations(DL, prepared.code, prepared.updates)
    return {
        languageCode: prepared.code,
        rows: prepared.rows,
        updated: keys.length,
        skipped: prepared.skipped,
        errors: prepared.errors
    }
}
