export default async function mark_read(payload, { DL, _admin }) {
    const { id } = payload
    if (!id) throw { status: 400, message: 'id required' }

    await DL.AdminNotification.updateOne(
        { id, adminId: _admin.id },
        { $set: { readAt: new Date() } }
    )

    return { read: true }
}

mark_read.config = {
    auth: 'required',
    required: ['id']
}
