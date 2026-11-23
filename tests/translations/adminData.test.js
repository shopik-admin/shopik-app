import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import getAdminData from '../../server/utils/data/getAdminData.js'

function bootData({ user = null } = {}) {
    const calls = { translations: [], languages: 0 }
    const boot = {
        utils: {
            auth: {
                async getAdmin() {
                    if (!user) throw new Error('no admin')
                    return user
                }
            },
            data: {
                async getLists() { return {} },
                async getTranslations(_boot, code) {
                    calls.translations.push(code)
                    return { code }
                },
                async getLanguages() {
                    calls.languages++
                    return []
                }
            }
        }
    }
    return { boot, calls }
}

describe('admin language selection', () => {
    it('uses the login cookie when there is no user yet', async () => {
        const { boot, calls } = bootData()
        const data = await getAdminData({ cookies: { adminLang: 'en' } }, boot)
        assert.deepEqual(calls.translations, ['en'])
        assert.equal(data.translations.code, 'en')
    })

    it('prefers the user preference over the browser cookie after login', async () => {
        const { boot, calls } = bootData({
            user: { id: 'a1', role: {}, languageCode: 'fr' }
        })
        const data = await getAdminData({ cookies: { adminLang: 'en' } }, boot)
        assert.deepEqual(calls.translations, ['fr'])
        assert.equal(data.translations.code, 'fr')
    })

    it('falls back to Hebrew for a user without a saved language', async () => {
        const { boot, calls } = bootData({
            user: { id: 'a1', role: {} }
        })
        await getAdminData({ cookies: { adminLang: 'en' } }, boot)
        assert.deepEqual(calls.translations, ['he'])
    })
})
