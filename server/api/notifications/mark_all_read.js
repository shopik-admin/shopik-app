export default async function mark_all_read(payload, { DL, _admin }) {
    const result = await DL.AdminNotification.update(
        { adminId: _admin.id, readAt: null },
        { readAt: new Date() }
    )

    return { updated: result?.modifiedCount ?? 0 }
}

mark_all_read.config = {
    auth: 'required'
}
