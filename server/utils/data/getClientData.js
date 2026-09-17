import resolveDomainId from '#server/utils/resolveDomainId.js'

export default async function getClientData(req, bootData) {
    const { utils } = bootData
    let user
    try {
        user = await utils.auth.getUser(req, bootData)
    } catch { }

    // Resolve the request domain for tenant-scoped settings (fail-open to
    // legacy unfiltered when unresolvable, e.g. no default domain yet).
    let domainId
    try {
        domainId = await resolveDomainId(req, bootData.DL)
    } catch { }

    const promises = [
        utils.data.getSettings({ ...bootData, domainId }),
        utils.data.getMenu(bootData),
        utils.data.getPickupStores(bootData),
    ]

    if (user)
        promises.push(utils.data.getUserOrder({ ...bootData, _user: user }))
    else
        promises.push(utils.data.getGuestCart({ req, DL: bootData.DL }))
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
        env: {
            FILES_BASE_URL: process.env.FILES_BASE_URL || 'https://files.shopik.co.il',
        },
    }
}