import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { splitItemBlocks, parseItemBlock, splitExtendedBalanceBlocks, parseExtendedBalanceBlock } from '../../server/external/comax/parser.js'

function itemXml(i) {
    return `<ClsItems><ID>${i}</ID><Barcode>${1000 + i}</Barcode><Name>מוצר ${i}</Name><Price>${i + 1}.5</Price>` +
        `<SuperDepartmentCode>${i % 20}</SuperDepartmentCode><SuperDepartment>מחלקה</SuperDepartment>` +
        `<DepartmentCode>3</DepartmentCode><Department>מחלקה</Department>` +
        `<GroupCode>4</GroupCode><Group>קבוצה</Group></ClsItems>`
}

function document(n) {
    const body = Array.from({ length: n }, (_, i) => itemXml(i)).join('\n')
    return `<?xml version="1.0" encoding="utf-8"?>\n<ArrayOfClsItems>\n${body}\n</ArrayOfClsItems>\n`
}

async function* chunks(text, size) {
    for (let i = 0; i < text.length; i += size)
        yield Buffer.from(text.slice(i, i + size), 'utf8')
}

async function collect(source) {
    const out = []
    for await (const block of splitItemBlocks(source)) out.push(block)
    return out
}

describe('comax item block splitter', () => {
    it('splits a catalog into one block per product', async () => {
        const blocks = await collect(chunks(document(5), 4096))

        assert.equal(blocks.length, 5)
        for (const block of blocks) {
            assert.ok(block.startsWith('<ClsItems>'))
            assert.ok(block.endsWith('</ClsItems>'))
        }
        assert.equal(parseItemBlock(blocks[2]).ID, 2)
    })

    it('produces the same blocks no matter where the chunks are cut', async () => {
        const doc = document(7)
        const expected = await collect(chunks(doc, 4096))

        // 1 byte at a time cuts the `<ClsItems>` start tag in half.
        for (const size of [1, 2, 3, 7, 13, 64, 511]) {
            const blocks = await collect(chunks(doc, size))
            assert.deepEqual(blocks, expected, `chunk size ${size}`)
        }
    })

    it('parses the item fields out of a block', async () => {
        const item = parseItemBlock(itemXml(0))

        assert.equal(item.ID, 0)
        assert.equal(item.Barcode, 1000)
        assert.equal(item.Name, 'מוצר 0')
        assert.equal(item.Price, 1.5)
        assert.equal(item.SuperDepartmentCode, 0)
        assert.equal(item.Department, 'מחלקה')
    })

    it('ignores envelope text and self-closing items', async () => {
        const doc = `<?xml version="1.0"?><soap:Envelope><soap:Body><ArrayOfClsItems>` +
            `<ClsItems><ID>1</ID></ClsItems><ClsItems/><ClsItems><ID>2</ID></ClsItems>` +
            `</ArrayOfClsItems></soap:Body></soap:Envelope>`

        const blocks = await collect(chunks(doc, 4096))

        assert.equal(blocks.length, 2)
        assert.equal(parseItemBlock(blocks[0]).ID, 1)
        assert.equal(parseItemBlock(blocks[1]).ID, 2)
    })

    it('yields the first item before the whole document was produced', async () => {
        let produced = 0
        const total = 500
        async function* source() {
            for (let i = 0; i < total; i++) {
                const xml = itemXml(i)
                produced += xml.length
                yield Buffer.from(xml)
            }
        }

        const iterator = splitItemBlocks(source())
        const first = await iterator.next()

        assert.equal(first.done, false)
        assert.ok(first.value.startsWith('<ClsItems>'))
        // A splitter that buffers the whole response would have produced
        // everything before handing out the first item.
        assert.ok(produced < total * 50, `produced ${produced} bytes before the first item`)
    })

    it('parses a block that arrives split across two chunks', async () => {
        const xml = itemXml(1)
        const cut = xml.indexOf('<ID>') + 2

        const blocks = await collect([
            Buffer.from(xml.slice(0, cut)),
            Buffer.from(xml.slice(cut))
        ])

        assert.equal(blocks.length, 1)
        assert.equal(parseItemBlock(blocks[0]).ID, 1)
    })
})

function balanceXml(i) {
    return `<ClsItemsBalance_Extended><Barcode>${1000 + i}</Barcode>` +
        `<DepartmentKod>13</DepartmentKod><SuperDepartmentKod>3</SuperDepartmentKod>` +
        `<LastSaleDate>01/10/2026 09:15:00</LastSaleDate><SalesLastDays>4</SalesLastDays>` +
        `<Balance>${i}</Balance></ClsItemsBalance_Extended>`
}

function balanceDocument(n) {
    const body = Array.from({ length: n }, (_, i) => balanceXml(i)).join('\n')
    return `<?xml version="1.0" encoding="utf-8"?>\n<soap:Envelope><soap:Body><ArrayOfClsItemsBalance_Extended>\n` +
        `${body}\n</ArrayOfClsItemsBalance_Extended></soap:Body></soap:Envelope>\n`
}

async function collectBalances(source) {
    const out = []
    for await (const block of splitExtendedBalanceBlocks(source)) out.push(block)
    return out
}

describe('comax sales window block splitter', () => {
    it('splits the extended balance feed into one block per item', async () => {
        const blocks = await collectBalances(chunks(balanceDocument(4), 4096))

        assert.equal(blocks.length, 4)
        for (const block of blocks) {
            assert.ok(block.startsWith('<ClsItemsBalance_Extended>'))
            assert.ok(block.endsWith('</ClsItemsBalance_Extended>'))
        }
        assert.equal(parseExtendedBalanceBlock(blocks[2]).Barcode, 1002)
    })

    it('does not confuse the extended tag with a plain item tag', async () => {
        const doc = `<ArrayOfClsItemsBalance_Extended>${balanceXml(0)}</ArrayOfClsItemsBalance_Extended>`

        assert.equal((await collect(chunks(doc, 4096))).length, 0)
        assert.equal((await collectBalances(chunks(doc, 4096))).length, 1)
    })

    it('produces the same blocks no matter where the chunks are cut', async () => {
        const doc = balanceDocument(5)
        const expected = await collectBalances(chunks(doc, 4096))

        for (const size of [1, 2, 5, 17, 300]) {
            const blocks = await collectBalances(chunks(doc, size))
            assert.deepEqual(blocks, expected, `chunk size ${size}`)
        }
    })

    it('parses the sales-window fields out of a block', () => {
        const row = parseExtendedBalanceBlock(balanceXml(3))

        assert.equal(row.Barcode, 1003)
        assert.equal(row.DepartmentKod, 13)
        assert.equal(row.LastSaleDate, '01/10/2026 09:15:00')
        assert.equal(row.SalesLastDays, 4)
        assert.equal(row.Balance, 3)
    })
})
