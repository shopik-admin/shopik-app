import { applyTranslationImport } from '#server/utils/texts/importer.js'

export default async function importTranslations(payload, { DL, _admin }) {
    // Import performs both creates and updates; enforce strict AND like the
    // settings import route (router permission arrays are OR).
    if (!_admin?.hasPermission?.('text:create') || !_admin?.hasPermission?.('text:update'))
        throw { status: 403, message: 'Forbidden' }

    return applyTranslationImport(DL, payload)
}

importTranslations.config = {
    required: ['fileBase64', 'filename', 'languageCode'],
    permissions: ['text:create', 'text:update']
}
