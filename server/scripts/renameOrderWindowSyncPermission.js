/**
 * Rename the old order-window sync permission in saved roles.
 * Usage: node server/scripts/runSeed.js renameOrderWindowSyncPermission
 *
 * `order_window:sync` moved under the order-window-templates prefix so the UI
 * groups it with the rest of the window permissions. Idempotent, safe to re-run.
 */
const OLD_PERMISSION = 'order_window:sync'
const NEW_PERMISSION = 'order_window_template:sync'

export default async function renameOrderWindowSyncPermission({ DL }) {
    const roles = await DL.Role.Model.find(
        { permissions: OLD_PERMISSION },
        { _id: 0, id: 1, name: 1, permissions: 1 }
    ).lean()

    for (const role of roles) {
        const permissions = [...new Set(
            role.permissions.map(permission =>
                permission === OLD_PERMISSION ? NEW_PERMISSION : permission
            )
        )]
        await DL.Role.updateOne({ id: role.id }, { permissions })
        console.log(`[renameOrderWindowSyncPermission] updated "${role.name}"`)
    }

    console.log(`[renameOrderWindowSyncPermission] Done — ${roles.length} role(s) updated`)
}
