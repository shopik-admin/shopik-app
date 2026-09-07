import isValidIsraeliId from '#common/functions/isValidIsraeliId.js'

export default async function idNumValidator(idNum) {
    if (!isValidIsraeliId(idNum))
        throw { status: 400, message: 'invalid id number' }
    return true
}
