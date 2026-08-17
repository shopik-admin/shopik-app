export default async function id(payload, { DL }) {
    const template = await DL.OrderWindowTemplate.readById(payload?.id)
    if (!template) throw { status: 400, message: 'order window template does not exist' }

    return template
}

id.config = {
    required: ['id'],
    permissions: 'order_window_template:id'
}
