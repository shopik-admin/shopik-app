import { getLanguages } from '#server/utils/texts/dictionary.js'

export default function getLanguagesData({ DL }) {
    return getLanguages(DL)
}
