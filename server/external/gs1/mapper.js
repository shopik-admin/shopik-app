// Maps a GS1 product payload (GET /external/product/{code}.json) to Shopik Product fields.
// GS1 wins for content — Comax remains the gate for existence (checked by the caller).

const firstValue = arr => (Array.isArray(arr) ? arr.map(e => e?.value).find(v => v != null && v !== '') : undefined) ?? ''

const joinValues = (arr, sep = ', ') =>
    (Array.isArray(arr) ? arr.map(e => e?.value).filter(v => v != null && v !== '') : []).join(sep)

// Food_Symbol_Red codes → nutrients flags (red "high in" labels)
function mapNutrients(additionalInfo) {
    const codes = new Set(
        (additionalInfo?.Food_Symbol_Red || []).map(e => e?.code).filter(Boolean)
    )
    const out = {}
    if (codes.has('FSR2')) out.sodium = true
    if (codes.has('FSR3')) out.sugar = true
    if (codes.has('FSR4')) out.fat = true
    const alcoholRaw = String(additionalInfo?.Alcohol_Percentage_in_Product || '')
    if (/[1-9]/.test(alcoholRaw)) out.alcohol = true
    return out
}

function mapKashrut(kashrut) {
    if (!kashrut) return {}
    const out = {}
    const supervision = firstValue(kashrut.Kosher_Supervision_Type)
    const rabbinate = joinValues(kashrut.Rabbinate)
    out.kashrut = [supervision, rabbinate].filter(Boolean).join(' / ')
    const passover = firstValue(kashrut.Kosher_for_Passover)
    if (passover && passover.includes('כשר לפסח')) out.passoverKashrut = 'kosher'
    return out
}

// Media_Assets_Deleted / Media_Assets_Unchecked:
// {deleted_PL_img:[{value,code}], deleted_HE_img, deleted_360_img} — code YES = removed by supplier
function mediaRemovalFlags(productInfo) {
    const pick = (section, key) => {
        const entry = productInfo?.[section]?.[key]
        const code = Array.isArray(entry) ? entry[0]?.code : entry?.code
        return code === 'YES'
    }
    return {
        deleted: pick('Media_Assets_Deleted', 'deleted_PL_img')
            || pick('Media_Assets_Deleted', 'deleted_HE_img')
            || pick('Media_Assets_Deleted', 'deleted_360_img'),
        unchecked: pick('Media_Assets_Unchecked', 'unchecked_PL_img')
            || pick('Media_Assets_Unchecked', 'unchecked_HE_img')
            || pick('Media_Assets_Unchecked', 'unchecked_360_img')
    }
}

function parseGs1Date(raw) {
    if (!raw) return null
    // '2024-11-10 08:45:43' → ISO
    const d = new Date(String(raw).replace(' ', 'T'))
    return Number.isNaN(d.getTime()) ? null : d
}

export function mapGs1ToProduct(item) {
    const info = item?.product_info || {}
    const main = info.Main_Fields || {}
    const general = info.General_Information || {}
    const marketing = info.Marketing_Information || {}
    const components = info.Product_Components_and_Instructions_General || {}
    const additional = info.Additional_Information || {}
    const system = info.System_Features || {}
    const internal = info.Internal_System_Fields || {}

    const gtin = String(main.GTIN || '').trim()
    if (!gtin) throw new Error('GS1 item missing Main_Fields.GTIN')

    const name = main.Trade_Item_Description || main.Short_Description || ''
    const marketingTexts = [
        general.Additional_Trade_Item_Description_1,
        marketing.Trade_Item_Marketing_Message,
        marketing.Trade_Item_Marketing_Message_2,
        marketing.Trade_Item_Marketing_Message_3,
        marketing.Trade_Item_Marketing_Message_4,
        marketing.Trade_Item_Marketing_Message_5,
        marketing.Trade_Item_Marketing_Message_6,
        marketing.Trade_Item_Marketing_Message_7
    ].filter(v => v != null && v !== '')
    const description = marketingTexts.join('\n').trim()
    const keywords = String(general.Search_Words || '')
        .split(',').map(s => s.trim()).filter(Boolean).slice(0, 20)

    const doc = {
        barcode: gtin,
        name,
        producer: main.BrandName || general.Manufacturer_Name || '',
        label: main.Variant || main.Sub_Brand_Name || '',
        regulatoryInfo: components.Ingredient_Sequence_and_Name || '',
        keywords,
        gs1ProductCode: internal.product_code || '',
        gs1SyncedAt: new Date(),
        gs1Raw: item
    }
    if (description) doc.description = description
    Object.assign(doc, mapKashrut(info.Kashrut))
    const nutrients = mapNutrients(additional)
    if (Object.keys(nutrients).length) doc.nutrients = nutrients
    if (!doc.kashrut) delete doc.kashrut

    return {
        doc,
        gtin,
        productCode: internal.product_code || '',
        modificationTime: parseGs1Date(system.modification_timestamp),
        mediaAssets: Array.isArray(item.media_assets) ? item.media_assets : [],
        removal: mediaRemovalFlags(info)
    }
}

export default { mapGs1ToProduct }
