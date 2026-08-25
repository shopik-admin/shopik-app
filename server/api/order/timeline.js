export default async function timeline({ orderId }, { DL }) {
    return DL.Timeline.read(
        { orderId },
        { _id: 0 },
        { sort: { createdAt: 1 }, limit: 0 }
    )
}

timeline.config = {
    required: ['orderId'],
    permissions: ['order:read']
}