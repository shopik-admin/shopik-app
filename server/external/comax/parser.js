import fs from 'fs'
import readline from 'readline'
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

export async function parseXmlFile(inputFile) {
    const readStream = fs.createReadStream(inputFile, 'utf8')
    const products = []
    const rl = readline.createInterface({
        input: readStream,
        crlfDelay: Infinity
    })

    let insideItem = false
    let currentXmlChunk = ''

    console.log('Starting conversion of XML file...')

    for await (const line of rl) {
        // Check if a new item block starts
        if (line.includes('<ClsItems>')) {
            insideItem = true
            currentXmlChunk = '' // Clear previous leftovers
        }

        if (insideItem) {
            currentXmlChunk += line + '\n'
        }

        // Check if the current item block ends
        if (line.includes('</ClsItems>')) {
            insideItem = false

            try {
                // Parse only this individual item block
                const parsedData = parser.parse(currentXmlChunk)

                // Extract the inner object out of the root <ClsItems> tag
                const itemObject = parsedData.ClsItems

                if (itemObject && itemObject.Price > 0 && itemObject.SuperDepartment && itemObject.SuperDepartmentCode != 12) {
                    // Write the stringified object to the file
                    products.push(itemObject)
                }
            } catch (parseError) {
                console.error('Failed parsing an item block:', parseError.message)
            }

            currentXmlChunk = '' // Reset memory chunk
        }
    }
    return products
}