import { getTranslations } from '#server/utils/texts/dictionary.js'

export default function getTranslationsData({ DL }, code) {
    return getTranslations(DL, code || 'he')
}
