export default async function id({ id }, { DL }) {
    const user = await DL.User.readById(id)
    if (!user) throw { status: 404, message: 'user not found' }
    return user
}

id.config = { required: ['id'], permissions: 'user:id' }
