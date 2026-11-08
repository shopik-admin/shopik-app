import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import notify from '../../server/api/supply_area/notify.js'

function makeDL() {
    const docs = []

    return {
        docs,
        SupplyAreaNotification: {
            readOne: async filter => docs.find(doc =>
                doc.email === filter.email && doc.addressKey === filter.addressKey
            ) || null,
            updateOne: async (filter, update) => {
                const doc = docs.find(item => item.id === filter.id)
                if (doc) Object.assign(doc, update.$set)
                return doc
            },
            create: async data => {
                const doc = { id: `notice-${docs.length + 1}`, ...data }
                docs.push(doc)
                return doc
            }
        }
    }
}

const address = {
    city: 'ירושלים',
    street: 'הרצל',
    building: 14,
    apartment: 3,
    areaId: null,
    location: { type: 'Point', coordinates: [35.21, 31.77] },
    extra: 'must not be stored'
}

describe('supply area notify endpoint', () => {
    it('rejects an invalid email', async () => {
        const DL = makeDL()
        await assert.rejects(
            () => notify({ email: 'not-an-email', address }, { DL }),
            error => error.status === 400
        )
    })

    it('stores the notification with a whitelisted address', async () => {
        const DL = makeDL()
        await notify({ email: 'test@example.com', address }, { DL, _user: { id: 'user-1' } })

        assert.equal(DL.docs.length, 1)
        assert.equal(DL.docs[0].email, 'test@example.com')
        assert.equal(DL.docs[0].userId, 'user-1')
        assert.equal(DL.docs[0].address.city, 'ירושלים')
        assert.equal(DL.docs[0].address.extra, undefined)
        assert.deepEqual(DL.docs[0].address.location, address.location)
    })

    it('updates an existing request instead of duplicating it', async () => {
        const DL = makeDL()
        await notify({ email: 'test@example.com', address }, { DL })
        const updatedLocation = { type: 'Point', coordinates: [35.22, 31.78] }
        await notify({
            email: 'TEST@example.com',
            address: { ...address, location: updatedLocation }
        }, { DL })

        assert.equal(DL.docs.length, 1)
        assert.deepEqual(DL.docs[0].address.location, updatedLocation)
    })
})
