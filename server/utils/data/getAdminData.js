export default async function getAdminData(req, bootData) {
    const { utils } = bootData
    let user, lists
    try { user = await utils.auth.getAdmin(req, bootData) }
    catch (e) { console.log('no admin user', e) }
    if (user?.id) {
        try { lists = await utils.data.getLists(bootData, user) }
        catch (e) { console.log('lists error', e) }
    }

    return {
        user, lists,
        env: {
            CARTO_KEY: process.env.CARTO_KEY || '',
            FILES_BASE_URL: process.env.FILES_BASE_URL || 'https://files.shopik.co.il',
            OPS_PROXIMITY_RADIUS_M: process.env.OPS_PROXIMITY_RADIUS_M || '',
            OPS_STORE_AUTO_SELECT_M: process.env.OPS_STORE_AUTO_SELECT_M || '',
            OPS_LOCATION_THROTTLE_MS: process.env.OPS_LOCATION_THROTTLE_MS || '',
            OPS_LOCATION_MIN_MOVE_M: process.env.OPS_LOCATION_MIN_MOVE_M || '',
        },
    }
}