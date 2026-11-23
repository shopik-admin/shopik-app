// Delete one inbox row. `adminId` is part of the filter on purpose: an id from
// another admin's inbox must never be deletable, even if it leaks.
export default async function remove(payload, { DL, _admin }) {
    const { id } = payload
    if (!id) throw { status: 400, message: 'id required' }

    const result = await DL.AdminNotification.deleteOne({ id, adminId: _admin.id })
    return { deleted: Boolean(result?.deletedCount) }
}

remove.config = {
    auth: 'required',
    required: ['id']
}
