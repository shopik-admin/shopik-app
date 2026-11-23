import pkg from '#package.json' with { type: 'json' }
import hebrewTexts from '#common/texts/hebrew.json' with { type: 'json' }
import uid from '#common/functions/uid.js'
import {
    BASE_LANGUAGE,
    BASE_LANGUAGE_CODE,
    isValidLanguageCode,
    normalizeLanguageCode
} from '#common/constants/translations.js'
import { languageCode as requireLanguageCode } from '#server/utils/texts/validate.js'

const baseTexts = hebrewTexts.texts || {}
const CACHE_TTL_SECONDS = 60 * 60
const MEMO_TTL_MS = 5000
const VERSION_KEY = 'tr:version'
const CACHE_PREFIX = 'tr:dict'
// A single Redis key per language is the whole dictionary. Include the app
// version so a deploy that edits hebrew.json never serves a stale payload.
const cacheKey = (code, version) => `${CACHE_PREFIX}:v${pkg.version}:${version || '0'}:${code}`

// Cache-hit memo: avoids JSON.parse + Redis GET on every SSR request. The
// version in the key makes writes visible across workers; the TTL is only a
// safety net for the Redis-unavailable path.
const memo = new Map()

function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function redisReady(DL) {
    return DL?.redis?.status === 'ready'
}

function versionOf(DL) {
    return redisReady(DL) ? DL.redis.get(VERSION_KEY).catch(() => '0') : Promise.resolve(null)
}

export function baseDictionary() {
    return baseTexts
}

export async function readLanguage(DL, code) {
    const normalized = normalizeLanguageCode(code)
    if (!normalized || !isValidLanguageCode(normalized)) return null
    if (normalized === BASE_LANGUAGE_CODE) {
        const doc = await DL.TranslationLanguage.readOne({ code: normalized }).catch(() => null)
        return { ...BASE_LANGUAGE, ...(doc || {}), isBase: true }
    }
    const doc = await DL.TranslationLanguage.readOne({ code: normalized }).catch(() => null)
    return doc ? { ...doc, isBase: false } : null
}

export async function getLanguages(DL) {
    const docs = await DL.TranslationLanguage.read({}, { _id: 0 }, { limit: 0 }).catch(() => [])
    const byCode = new Map()
    for (const doc of docs || []) {
        if (!doc?.code) continue
        byCode.set(doc.code, { ...doc, isBase: doc.code === BASE_LANGUAGE_CODE })
    }

    const hebrew = byCode.get(BASE_LANGUAGE_CODE)
    const base = hebrew ? { ...BASE_LANGUAGE, ...hebrew, isBase: true } : { ...BASE_LANGUAGE, isBase: true }
    const languages = [base]

    for (const doc of byCode.values()) {
        if (doc.code === BASE_LANGUAGE_CODE) continue
        languages.push({ ...doc, isBase: false })
    }

    return languages.sort((a, b) =>
        String(a.nativeName || a.name || a.code).localeCompare(String(b.nativeName || b.name || b.code), 'he')
    )
}

export async function getLanguagesWithCounts(DL) {
    const [languages, dictionaries] = await Promise.all([
        getLanguages(DL),
        DL.TranslationDictionary.read({}, { _id: 0, languageCode: 1, texts: 1 }, { limit: 0 }).catch(() => [])
    ])
    const counts = new Map(
        (dictionaries || []).map(doc => [doc.languageCode, Object.keys(doc.texts || {}).length])
    )
    return languages.map(language => ({
        ...language,
        textCount: counts.get(language.code) || 0
    }))
}

async function readTexts(DL, code) {
    const doc = await DL.TranslationDictionary.readOne(
        { languageCode: code },
        { _id: 0, texts: 1 }
    ).catch(() => null)
    return isObject(doc?.texts) ? doc.texts : {}
}

function payloadFor(language, texts, fallback) {
    return {
        code: language.code,
        name: language.name || language.code,
        nativeName: language.nativeName || language.name || language.code,
        direction: language.direction === 'ltr' ? 'ltr' : 'rtl',
        flag: language.flag || '',
        texts,
        fallback
    }
}

/**
 * Effective dictionary layers for a language.
 *
 * The client bundle already contains hebrew.json, so only overrides travel:
 *   texts    -> the language's DB overrides
 *   fallback -> Hebrew DB overrides
 * `TR` resolves texts -> fallback -> hebrew.json -> key.
 */
export async function getTranslations(DL, requestedCode) {
    let language = await readLanguage(DL, requestedCode)
    if (!language) language = await readLanguage(DL, BASE_LANGUAGE_CODE)
    if (!language) language = { ...BASE_LANGUAGE, isBase: true }

    const version = await versionOf(DL)
    const key = cacheKey(language.code, version)
    const now = Date.now()
    const cached = memo.get(language.code)
    if (cached && cached.version === version && cached.expires > now) return cached.value

    if (version !== null) {
        try {
            const raw = await DL.redis.get(key)
            if (raw) {
                const parsed = JSON.parse(raw)
                memo.set(language.code, { version, value: parsed, expires: now + MEMO_TTL_MS })
                return parsed
            }
        } catch { }
    }

    const [texts, hebrewOverrides] = await Promise.all([
        readTexts(DL, language.code),
        language.code === BASE_LANGUAGE_CODE
            ? Promise.resolve({})
            : readTexts(DL, BASE_LANGUAGE_CODE)
    ])

    const payload = payloadFor(language, texts, hebrewOverrides)

    memo.set(language.code, { version, value: payload, expires: now + MEMO_TTL_MS })
    if (version !== null) {
        try {
            await DL.redis.set(key, JSON.stringify(payload), 'EX', CACHE_TTL_SECONDS)
        } catch { }
    }

    return payload
}

export async function invalidateTranslations(DL) {
    memo.clear()
    if (!redisReady(DL)) return
    try {
        await DL.redis.incr(VERSION_KEY)
    } catch { }
}

/** Add/replace one key atomically, without turning dotted keys into paths. */
export async function setTranslation(DL, { languageCode, key, value }) {
    const code = requireLanguageCode(languageCode)
    const now = new Date()
    const pipeline = [
        {
            $set: {
                id: { $ifNull: ['$id', uid()] },
                active: { $ifNull: ['$active', true] },
                languageCode: code,
                texts: {
                    $arrayToObject: {
                        $concatArrays: [
                            {
                                $filter: {
                                    input: { $objectToArray: { $ifNull: ['$texts', {}] } },
                                    as: 'entry',
                                    cond: { $ne: ['$$entry.k', key] }
                                }
                            },
                            [{ k: key, v: value }]
                        ]
                    }
                },
                updatedAt: now,
                createdAt: { $ifNull: ['$createdAt', now] }
            }
        }
    ]

    await DL.TranslationDictionary.Model.collection.updateOne(
        { languageCode: code },
        pipeline,
        { upsert: true }
    )

    await invalidateTranslations(DL)
    return { languageCode: code, key, value }
}

/** Remove one key atomically. Removing the last Hebrew override reverts to JSON. */
export async function removeTranslation(DL, { languageCode, key }) {
    const code = requireLanguageCode(languageCode)
    const now = new Date()
    const pipeline = [
        {
            $set: {
                texts: {
                    $arrayToObject: {
                        $filter: {
                            input: { $objectToArray: { $ifNull: ['$texts', {}] } },
                            as: 'entry',
                            cond: { $ne: ['$$entry.k', key] }
                        }
                    }
                },
                updatedAt: now
            }
        }
    ]

    const result = await DL.TranslationDictionary.Model.collection.updateOne(
        { languageCode: code },
        pipeline
    )
    await invalidateTranslations(DL)
    return { languageCode: code, key, removed: result.modifiedCount > 0 }
}

/**
 * Merge a batch of translations into one language document. Used by import:
 * a 5,000-row file is still one write per language, not 5,000 documents.
 */
export async function replaceTranslations(DL, languageCode, updates) {
    const code = requireLanguageCode(languageCode)
    if (!isObject(updates) || !Object.keys(updates).length) return { languageCode: code, updated: 0 }

    for (let attempt = 0; attempt < 3; attempt++) {
        const existing = await DL.TranslationDictionary.readOne(
            { languageCode: code },
            { _id: 0, texts: 1, updatedAt: 1 }
        ).catch(() => null)
        const nextTexts = { ...(existing?.texts || {}), ...updates }
        const now = new Date()
        const filter = { languageCode: code }
        if (existing?.updatedAt) filter.updatedAt = existing.updatedAt

        const result = await DL.TranslationDictionary.updateOne(
            filter,
            {
                $set: { languageCode: code, texts: nextTexts, updatedAt: now },
                $setOnInsert: { id: uid(), active: true, createdAt: now }
            },
            { upsert: !existing }
        ).catch(() => null)

        // DL.updateOne returns the updated document (not a Mongo result
        // object), so a truthy result is the success signal here. A null result
        // means the updatedAt guard lost a race and the merge must retry.
        if (result) {
            await invalidateTranslations(DL)
            return { languageCode: code, updated: Object.keys(updates).length }
        }
    }

    throw { status: 409, message: 'dictionary changed while importing, try again' }
}

/**
 * Shape the admin table: one row per key and one column per language.
 * `values` are raw overrides (empty = fallback), `effective` is what the app
 * would display, `base` is the hebrew.json value.
 */
export async function getTranslationRows(DL) {
    const [languages, dictionaries] = await Promise.all([
        getLanguages(DL),
        DL.TranslationDictionary.read({}, { _id: 0, languageCode: 1, texts: 1 }, { limit: 0 }).catch(() => [])
    ])

    const rawByCode = new Map()
    for (const doc of dictionaries || []) {
        if (!doc?.languageCode) continue
        rawByCode.set(doc.languageCode, isObject(doc.texts) ? doc.texts : {})
    }

    const hebrewOverrides = rawByCode.get(BASE_LANGUAGE_CODE) || {}
    const effectiveHebrew = { ...baseTexts, ...hebrewOverrides }
    const keys = new Set(Object.keys(baseTexts))
    for (const texts of rawByCode.values()) {
        for (const key of Object.keys(texts)) keys.add(key)
    }

    const entries = [...keys].sort((a, b) => a.localeCompare(b)).map(key => {
        const values = {}
        const effective = {}
        const sources = {}

        for (const language of languages) {
            const raw = rawByCode.get(language.code) || {}
            const own = typeof raw[key] === 'string' ? raw[key] : ''
            values[language.code] = own

            if (language.code === BASE_LANGUAGE_CODE) {
                effective[language.code] = own || effectiveHebrew[key] || ''
                sources[language.code] = own ? 'override' : (baseTexts[key] !== undefined ? 'base' : 'missing')
            } else {
                effective[language.code] = own || effectiveHebrew[key] || ''
                sources[language.code] = own ? 'override' : (effectiveHebrew[key] ? 'fallback' : 'missing')
            }
        }

        return {
            key,
            base: baseTexts[key] ?? '',
            values,
            effective,
            sources,
            custom: baseTexts[key] === undefined
        }
    })

    const stats = languages.map(language => {
        const raw = rawByCode.get(language.code) || {}
        const overrides = Object.keys(raw).length
        const missing = language.code === BASE_LANGUAGE_CODE
            ? 0
            : entries.filter(entry => !entry.values[language.code] && entry.effective[BASE_LANGUAGE_CODE]).length
        return { code: language.code, overrides, missing }
    })

    return {
        languages: languages.map(language => ({
            ...language,
            textCount: Object.keys(rawByCode.get(language.code) || {}).length
        })),
        entries,
        stats
    }
}
