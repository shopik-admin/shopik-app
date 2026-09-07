// Israeli ID Number validation (Teudat Zehut) — shared by client and server.
//
// Official checksum: pad with leading zeros to 9 digits, multiply each digit
// by 1/2 alternately, sum the digits of products (>9), total must divide by 10.
// Known problematic numbers (e.g. '000000000') are explicitly rejected even
// when they happen to pass the checksum.

const BLOCKED_ID_NUMBERS = new Set([
    '000000000',
    '111111111',
    '222222222',
    '333333333',
    '444444444',
    '555555555',
    '666666666',
    '777777777',
    '888888888',
    '999999999',
    '123456789',
    '012345678',
    '987654321',
])

export default function isValidIsraeliId(value) {
    const str = String(value ?? '').trim().replace(/[\s-]/g, '')
    if (!/^\d{5,9}$/.test(str)) return false
    const padded = str.padStart(9, '0')
    if (BLOCKED_ID_NUMBERS.has(padded)) return false
    let sum = 0
    for (let i = 0; i < 9; i++) {
        let num = Number(padded[i]) * ((i % 2) + 1)
        if (num > 9) num -= 9
        sum += num
    }
    return sum % 10 === 0
}
