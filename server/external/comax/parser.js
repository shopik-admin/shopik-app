import fs from 'fs'
import { XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: true,
    trimValues: true
})

export function parseXml(xml) {
    const result = parser.parse(xml)
    return result
}

/**
 * Normalise Comax's inconsistent array handling.
 *   undefined → []
 *   object    → [object]
 *   array     → array (as-is)
 */
export function normalizeArray(value) {
    if (Array.isArray(value)) return value
    if (value != null && typeof value === 'object') return [value]
    return []
}

const ITEM_OPEN_TAG = '<ClsItems'
const ITEM_CLOSE_TAG = '</ClsItems>'
const BALANCE_OPEN_TAG = '<ClsItemsBalance_Extended'
const BALANCE_CLOSE_TAG = '</ClsItemsBalance_Extended>'

/**
 * Index of the next `<openTag ...>` start tag, or -1 when there is none.
 * Tolerates attributes (`<ClsItems foo="1">`) and rejects look-alikes
 * (`<ClsItemsFoo>`): the char right after the name must end the tag or be
 * whitespace. A tag sitting at the very end of the buffer counts as found —
 * it may still be arriving, split across chunks.
 */
function findOpenTag(buf, openTag, from = 0) {
    let i = buf.indexOf(openTag, from)
    while (i !== -1) {
        const next = buf[i + openTag.length]
        if (next === undefined) return i
        if (next === '>' || next === ' ' || next === '\t' || next === '\n' || next === '\r')
            return i
        i = buf.indexOf(openTag, i + openTag.length)
    }
    return -1
}

/**
 * Split a stream of XML text into per-item blocks.
 *
 * A mass price update makes the Comax delta the whole catalog — hundreds of
 * MB. Parsing that as one document (one string + one object tree + one
 * mapped array alive at once) blew the container memory limit. This keeps at
 * most ONE item block in memory no matter how the network chops the
 * response up.
 *
 * @param {AsyncIterable<string|Uint8Array>} source
 * @yields {string} raw XML of a single item block
 */
async function* splitBlocks(source, openTag, closeTag) {
    const decoder = new TextDecoder('utf-8')
    let buf = ''

    for await (const chunk of source) {
        buf += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })

        for (;;) {
            const start = findOpenTag(buf, openTag)
            if (start === -1) break                       // no item in the buffer
            const gt = buf.indexOf('>', start)
            if (gt === -1) break                          // start tag split across chunks
            if (buf[gt - 1] === '/') {                   // <ClsItems/> → empty item
                buf = buf.slice(gt + 1)
                continue
            }
            const close = buf.indexOf(closeTag, gt)
            if (close === -1) break                       // item body not complete yet
            const block = buf.slice(start, close + closeTag.length)
            buf = buf.slice(close + closeTag.length)
            yield block
        }

        // No open tag left → the buffer holds only inter-item text (the SOAP
        // envelope header/footer). Keep a short tail so a start tag split
        // across chunks is never dropped.
        if (findOpenTag(buf, openTag) === -1 && buf.length > 1024)
            buf = buf.slice(-(openTag.length + 64))
    }
}

/** `<ClsItems>` blocks — the products/details feeds. */
export function splitItemBlocks(source) {
    return splitBlocks(source, ITEM_OPEN_TAG, ITEM_CLOSE_TAG)
}

/**
 * `<ClsItemsBalance_Extended>` blocks — the sales-window (last sale date) feed.
 * Same format concerns as the catalog: one store's 30-day response is ~17 MB.
 */
export function splitExtendedBalanceBlocks(source) {
    return splitBlocks(source, BALANCE_OPEN_TAG, BALANCE_CLOSE_TAG)
}

/**
 * Parse one `<ClsItems>` block into the raw item object.
 * Uses the same parser config as the whole-document parse, so the values are
 * identical to the non-streaming path.
 */
export function parseItemBlock(xml) {
    return parser.parse(xml)?.ClsItems ?? null
}

export function parseExtendedBalanceBlock(xml) {
    return parser.parse(xml)?.ClsItemsBalance_Extended ?? null
}

export async function parseXmlFile(inputFile) {
    const readStream = fs.createReadStream(inputFile, 'utf8')
    const products = []

    console.log('Starting conversion of XML file...')

    for await (const block of splitItemBlocks(readStream)) {
        try {
            const itemObject = parseItemBlock(block)

            if (itemObject && itemObject.Price > 0 && itemObject.SuperDepartment && itemObject.SuperDepartmentCode != 12) {
                // Write the stringified object to the file
                products.push(itemObject)
            }
        } catch (parseError) {
            console.error('Failed parsing an item block:', parseError.message)
        }
    }
    return products
}
