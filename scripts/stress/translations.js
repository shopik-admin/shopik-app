// Translation stress scenario.
//
// The read routes are part of the normal sweep (routes.js). This scenario covers
// what the sweep cannot: a burst of concurrent single-key edits and a CSV import
// against one language, then proves the result is still ONE dictionary document
// and that no concurrent update was lost.

import { latencyStats, pool } from './util.js'

const CREATE_COUNT = 50
const IMPORT_COUNT = 300
const READ_COUNT = 100

export async function runTranslationStress({ clients, fixtures, log = () => { } }) {
    const admin = clients?.admin
    if (!admin) throw new Error('translation stress needs the admin session')
    if (!fixtures?.db) throw new Error('translation stress needs the stress DB connection')

    const code = `zz-${Math.random().toString(36).slice(2, 6)}`
    const language = {
        code,
        name: `Stress ${code}`,
        nativeName: `Stress ${code}`,
        direction: 'ltr'
    }

    let languageId = null
    let created = null

    try {
        created = await admin.call('translation/create_language', language, { keepBody: true })
        if (!created.ok)
            throw new Error(`create_language failed: ${created.error || created.kind}`)
        languageId = created.body?.data?.id
        if (!languageId) throw new Error('create_language returned no id')

        // Warm the dictionary cache, then hammer the cache-hit path.
        const warm = await admin.call('translation/dictionary', { code })
        if (!warm.ok) throw new Error(`dictionary warm-up failed: ${warm.error || warm.kind}`)

        const reads = await pool(READ_COUNT, 12, () => admin.call('translation/dictionary', { code }))
        const readStats = latencyStats(reads.map(item => item.ms))
        const readFailures = reads.filter(item => !item.ok).length

        // Concurrent writes to distinct keys in the same document. The atomic
        // map update is what keeps all of them.
        const writes = await pool(CREATE_COUNT, 10, index => admin.call('translation/create', {
            languageCode: code,
            key: `stress_${index}`,
            value: `value ${index}`
        }))
        const writeFailures = writes.filter(item => !item.ok).length

        const dictionary = await admin.call('translation/dictionary', { code }, { keepBody: true })
        const texts = dictionary.body?.data?.texts || {}
        const lost = Array.from({ length: CREATE_COUNT }, (_, index) => `stress_${index}`)
            .filter((key, index) => texts[key] !== `value ${index}`)

        // A 300-row import is still one document write per language.
        const csv = [
            `key,${code}`,
            ...Array.from({ length: IMPORT_COUNT }, (_, index) => `import_${index},imported ${index}`)
        ].join('\r\n')
        const imported = await admin.call('translation/import', {
            languageCode: code,
            filename: 'stress.csv',
            fileBase64: Buffer.from(csv, 'utf8').toString('base64')
        }, { keepBody: true })

        const documentCount = await fixtures.db
            .collection('translation_dictionaries')
            .countDocuments({ languageCode: code })
        const document = await fixtures.db
            .collection('translation_dictionaries')
            .findOne({ languageCode: code }, { projection: { texts: 1 } })
        const keyCount = Object.keys(document?.texts || {}).length

        return {
            code,
            reads: { ...readStats, failures: readFailures },
            writes: { count: CREATE_COUNT, failures: writeFailures, lost },
            import: {
                ok: imported.ok,
                updated: imported.body?.data?.updated ?? null,
                errors: imported.body?.data?.errors?.length ?? null
            },
            mongo: { documents: documentCount, keys: keyCount },
            expected: {
                documents: 1,
                minimumKeys: CREATE_COUNT + IMPORT_COUNT
            }
        }
    } finally {
        if (languageId) {
            const removed = await admin.call('translation/delete_language', { id: languageId })
            if (!removed.ok) log(`[translations] cleanup failed: ${removed.error || removed.kind}`)
        }
        const left = await fixtures.db
            .collection('translation_dictionaries')
            .countDocuments({ languageCode: code })
            .catch(() => null)
        if (left) log(`[translations] cleanup left ${left} dictionary document(s) for ${code}`)
    }
}

export function printTranslationStress(result) {
    const status = result.writes.lost.length === 0
        && result.writes.failures === 0
        && result.mongo.documents === 1
        && result.mongo.keys >= result.expected.minimumKeys
        ? 'PASS'
        : 'FAIL'

    console.log(`\n[translations] ${status} — language ${result.code}`)
    console.log(`  dictionary reads: ${result.reads.count}, failures ${result.reads.failures}, p50 ${result.reads.p50}ms, p95 ${result.reads.p95}ms`)
    console.log(`  concurrent writes: ${result.writes.count}, failures ${result.writes.failures}, lost ${result.writes.lost.length}`)
    console.log(`  import: ok=${result.import.ok} updated=${result.import.updated} errors=${result.import.errors}`)
    console.log(`  mongo: ${result.mongo.documents} dictionary document(s), ${result.mongo.keys} keys (expected >= ${result.expected.minimumKeys})`)
    if (result.writes.lost.length)
        console.log(`  lost keys: ${result.writes.lost.slice(0, 10).join(', ')}`)
}
