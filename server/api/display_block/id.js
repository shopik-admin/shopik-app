export default async function id({ id }, { DL }) {
    return DL.DisplayBlock.readById(id)
}

id.config = {
    required: ['id'],
    permissions: ['display_block:id']
}
