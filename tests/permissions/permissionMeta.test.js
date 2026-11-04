import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import allPermissions from '#server/utils/auth/permissions.js'
import apiKeyPermissions from '#common/constants/apiKeyPermissions.js'
import { permissionGroups, permissionMeta } from '#common/constants/permissionMeta.js'

const hebrew = /[\u0590-\u05FF]/
const knownPermissions = [...allPermissions, ...apiKeyPermissions]

describe('permission metadata', () => {
    it('covers every permission in the server and API key lists', () => {
        const missing = knownPermissions.filter((permission) => !permissionMeta[permission])
        assert.deepEqual(missing, [])
    })

    it('does not describe permissions that no longer exist', () => {
        const known = new Set(knownPermissions)
        const extra = Object.keys(permissionMeta).filter((permission) => !known.has(permission))
        assert.deepEqual(extra, [])
    })

    it('has a Hebrew name and description for every permission', () => {
        for (const permission of knownPermissions) {
            const { name, description } = permissionMeta[permission]
            assert.match(name, hebrew, `${permission} name is not in Hebrew`)
            assert.match(description, hebrew, `${permission} description is not in Hebrew`)
            assert.ok(description.length <= 90, `${permission} description is too long`)
        }
    })

    it('has a Hebrew section title for every permission prefix', () => {
        for (const permission of knownPermissions) {
            const prefix = permission.split(':')[0]
            assert.match(permissionGroups[prefix] || '', hebrew, `missing group title for ${prefix}`)
        }
    })
})
