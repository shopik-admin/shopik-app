import { importPreviewPayload, prepareTranslationImport } from '#server/utils/texts/importer.js'

export default async function previewImport(payload, { DL }) {
    const prepared = await prepareTranslationImport(DL, payload)
    return importPreviewPayload(prepared)
}

previewImport.config = {
    required: ['fileBase64', 'filename', 'languageCode'],
    permissions: ['text:read']
}
