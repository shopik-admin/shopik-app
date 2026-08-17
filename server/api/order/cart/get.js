export default async function get(payload, { DL, _user, utils }) {
    return utils.data.getUserOrder({ DL, _user })
}

get.config = { auth: 'required' }
