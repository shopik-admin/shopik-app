import geocodeFactory from './geocode.js'
import smsFactory from './sms/index.js'
import comaxFactory from './comax/index.js'
import hypFactory from './hyp/index.js'
import gs1Factory from './gs1/index.js'

export default function externalBuilder({ DL }) {
    const sms = smsFactory({ DL })
    const comax = comaxFactory({ DL })
    const hyp = hypFactory({ DL })
    const geocode = geocodeFactory({ DL })
    const gs1 = gs1Factory({ DL })

    return {
        sms,
        geocode,
        comax,
        hyp,
        gs1
    }
}