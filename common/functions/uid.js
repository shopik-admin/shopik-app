import { randomBytes, randomInt } from 'crypto'

const MIN_LENGTH = 6
const DEFAULT_LENGTH = 16

export default function uid(length = DEFAULT_LENGTH, numberOnly = false) {
    if (!Number.isInteger(length) || length < MIN_LENGTH)
        throw new Error(`uid: length must be a positive integer greater than or equal to ${MIN_LENGTH}, got ${length}`)


    if (numberOnly) {
        const min = Math.pow(10, length - 1)
        const max = Math.pow(10, length)
        return randomInt(min, max).toString()
    }

    return randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length)
}