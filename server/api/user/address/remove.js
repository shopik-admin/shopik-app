export default function remove(payload, { DL, _user }) {
    return DL.User.updateOne(
        { id: _user.id },
        { $pull: { addresses: { addressId: payload.addressId } } },
        { select: DL.User.defaultSelect }
    )
}

remove.config = { auth: 'required', required: ['addressId'] }
