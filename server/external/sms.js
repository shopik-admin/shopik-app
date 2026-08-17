export default function sms({ DL }) {
    async function send(phones, message) {
        let logPromise, log
        try {
            const logData = {
                action: 'sms',
                direction: DL.Log.constants.DIRECTION.OUT,
                data: {
                    request: {
                        phones,
                        body: message
                    }
                }
            }
            log = DL.Log.start(logData)
            log.actor({ type: DL.Log.constants.ACTOR.API })
            console.log(`Phone: ${phones.join(', ')}\nMessage: "${message}"`)
            logPromise = log.success({ message: 'success' })
        } catch (error) {
            logPromise = log.error({ message: 'error' })
        } finally {
            if (logPromise)
                await logPromise
        }
    }

    async function otp(phone, otp) {
        await send([phone], `Your OTP: ${otp}\nValid for 10 minutes`)
    }

    return { send, otp }
}