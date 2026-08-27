import geocode from './geocode.js'
import smsFactory from './sms.js'
import comaxFactory from './comax/index.js'
import hypFactory from './hyp/index.js'

export default function externalBuilder({ DL }) {
    const sms = smsFactory({ DL })
    const comax = comaxFactory({ DL })
    const hyp = hypFactory({ DL })

    return {
        sms,
        geocode,
        comax,
        hyp
    }
}