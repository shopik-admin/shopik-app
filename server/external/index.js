import geocode from './geocode.js'
import smsFactory from './sms.js'
import comaxFactory from './comax/index.js'

export default function externalBuilder({ DL }) {
    const sms = smsFactory({ DL })
    const comax = comaxFactory({ DL })

    return {
        sms,
        geocode,
        comax
    }
}