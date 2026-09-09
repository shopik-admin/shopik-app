export default async function deleteBlock(payload, { DL, utils }) {
    const { id } = payload

    const block = await DL.DisplayBlock.readById(id)
    if (!block) throw { status: 404, message: 'Display block not found' }

    const result = await DL.DisplayBlock.deleteOne({ id })
    await utils.data.displayBlocks.invalidateDisplayCache(DL, block.domainId, block)
    return result
}

deleteBlock.config = {
    required: ['id'],
    permissions: ['display_block:delete']
}
