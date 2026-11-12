// Admin notification counters.
//
// Add a source here and read it in the client with
// useNotificationCount('<key>'). count() must stay cheap (an indexed
// countDocuments) — it runs on admin page load and window focus. An optional
// permission gates the source per admin, so a new counter never widens access
// to another feature.
export const notificationSources = [
    {
        key: 'comax.gs1Aliases',
        permission: 'comax_product:read',
        count: ({ DL }) => DL.Gs1Product.Model.countDocuments({ aliasStatus: 'ambiguous' })
    }
]

export default { notificationSources }
