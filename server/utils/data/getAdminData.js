export default async function getAdminData(req, bootData) {
    const { utils } = bootData
    let user, lists
    try { user = await utils.auth.getAdmin(req, bootData) }
    catch (e) { console.log('no admin user', e) }
    if (user?.id) {
        try { lists = await utils.data.getLists(bootData, user) }
        catch (e) { console.log('lists error', e) }
    }

    // Logged-in admins have a persisted preference. The login screen has no
    // user yet, so it follows the browser's last choice.
    const languageCode = user
        ? (user.languageCode || 'he')
        : (req?.cookies?.adminLang || 'he')

    const [translations, languages] = await Promise.all([
        utils.data.getTranslations(bootData, languageCode).catch(error => {
            console.log('translations error', error)
            return undefined
        }),
        utils.data.getLanguages(bootData).catch(error => {
            console.log('languages error', error)
            return undefined
        })
    ])

    return {
        user, lists, translations, languages,
        env: {
            CARTO_KEY: process.env.CARTO_KEY || '',
            FILES_BASE_URL: process.env.FILES_BASE_URL || 'https://files.shopik.co.il',
            OPS_PROXIMITY_RADIUS_M: process.env.OPS_PROXIMITY_RADIUS_M || '',
            OPS_STORE_AUTO_SELECT_M: process.env.OPS_STORE_AUTO_SELECT_M || '',
        },
    }
}
