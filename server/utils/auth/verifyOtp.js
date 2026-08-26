const MAX_ATTEMPTS = 5

export default async function verifyOtp(DL, storedOtp, otp) {
    if (!storedOtp?.otp)
        return false
    if (storedOtp.otp === otp)
        return true

    const attempts = (storedOtp.attempts || 0) + 1
    try {
        if (attempts >= MAX_ATTEMPTS)
            await DL.Otp.deleteOne({ _id: storedOtp._id })
        else
            await DL.Otp.updateOne({ _id: storedOtp._id }, { attempts })
    } catch {}

    return false
}
