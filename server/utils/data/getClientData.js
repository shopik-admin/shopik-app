export default async function getClientData(req, bootData) {
    const { utils } = bootData
    let user
    try {
        user = await utils.auth.getUser(req, bootData)
    } catch { }

    const promises = [
        utils.data.getSettings(bootData),
        utils.data.getMenu(bootData),
        utils.data.getPickupStores(bootData),
    ]

    if (user)
        promises.push(utils.data.getUserOrder({ ...bootData, _user: user }))
    const [
        settingsResult,
        menuResult,
        pickupStoresResult,
        orderResult
    ] = await Promise.allSettled(promises)

    if (settingsResult.status === 'rejected')
        console.log('settings error', settingsResult.reason)

    if (menuResult.status === 'rejected')
        console.log('menu error', menuResult.reason)

    return {
        user,
        order: orderResult?.status === 'fulfilled' ? orderResult.value : undefined,
        pickupStores: pickupStoresResult.status === 'fulfilled' ? pickupStoresResult.value : undefined,
        settings: settingsResult.status === 'fulfilled' ? settingsResult.value : undefined,
        menu: menuResult.status === 'fulfilled' ? menuResult.value : undefined,
    }
}