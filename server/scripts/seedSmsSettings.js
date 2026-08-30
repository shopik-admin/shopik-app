import createDL from '../dl/index.js'

async function main() {
    const DL = await createDL()
    const domainId = process.argv[2] || 'default'

    const existing = await DL.Setting.readOne({ domainId, key: 'sms:019' })
    if (existing) {
        console.log(`[seedSmsSettings] already exists for domainId=${domainId} key=sms:019`, existing.value)
        process.exit(0)
    }

    const value = {
        TOKEN_019: process.env.TOKEN_019 || '',
        USERNAME_019: process.env.USERNAME_019 || '',
        SMS_SOURCE_019: process.env.SMS_SOURCE_019 || 'Shopik',
        SMS_API_URL: process.env.SMS_API_URL || 'https://019sms.co.il/api'
    }

    const doc = await DL.Setting.create({
        domainId,
        key: 'sms:019',
        value,
        category: 'external providers',
        subCategory: '019',
        formType: 'config',
        renderType: 'config'
    })
    console.log('[seedSmsSettings] created', { domainId, key: 'sms:019', id: doc.id || doc._id, value })
    process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
