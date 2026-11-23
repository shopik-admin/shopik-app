import { getTranslations } from '#server/utils/texts/dictionary.js'

export default async function dictionary({ code }, { DL }) {
    return getTranslations(DL, code)
}

// Public on purpose: the admin login screen has no user yet, and the payload
// contains UI strings only. It is served from the dictionary cache.
dictionary.config = { auth: 'none' }
