export default async function getAdminData(req, bootData) {
    const { utils } = bootData
    let user, lists
    try { user = await utils.auth.getAdmin(req, bootData) }
    catch (e) { console.log('no admin user', e) }
    if (user?.id) {
        try { lists = await utils.data.getLists(bootData) }
        catch (e) { console.log('lists error', e) }
    }

    return { user, lists }
}