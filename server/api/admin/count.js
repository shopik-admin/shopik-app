/**
 * @param {BootData} bootData
 */
export default async function count({ filter, search }, bootData) {
    const { DL } = bootData
    return DL.Admin.count(filter, search)
}

count.config = {
    permissions: 'admin:read'
}