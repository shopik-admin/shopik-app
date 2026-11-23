import { getTranslationRows } from '#server/utils/texts/dictionary.js'

export default async function read(payload, { DL }) {
    return getTranslationRows(DL)
}

read.config = {
    permissions: ['text:read']
}
