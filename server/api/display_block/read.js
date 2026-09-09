export default async function read(payload, { DL }) {
    const { filter = {}, select } = payload
    return DL.DisplayBlock.read(filter, select || DL.DisplayBlock.defaultSelect, payload)
}

read.config = {
    permissions: ['display_block:read']
}
