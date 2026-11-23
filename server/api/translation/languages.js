import { getLanguagesWithCounts } from '#server/utils/texts/dictionary.js'

export default async function languages(payload, { DL }) {
    return getLanguagesWithCounts(DL)
}

// Public: the login screen language switcher uses the same list.
languages.config = { auth: 'none' }
