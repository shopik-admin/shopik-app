export default function Head({ title = '', description = '', noindex = false, canonical, og, jsonLd }) {
    return <>
        <title>{title}</title>
        <meta name='description' content={description} />
        {noindex && <meta name='robots' content='noindex' />}
        {canonical && <link rel='canonical' href={canonical} />}
        {og && <>
            <meta property='og:title' content={og.title || title} />
            <meta property='og:description' content={og.description || description} />
            {og.url && <meta property='og:url' content={og.url} />}
            {og.type && <meta property='og:type' content={og.type} />}
            {og.image && <meta property='og:image' content={og.image} />}
            {og.siteName && <meta property='og:site_name' content={og.siteName} />}
            <meta name='twitter:card' content={og.image ? 'summary_large_image' : 'summary'} />
        </>}
        {(jsonLd || []).map((obj, i) =>
            <script
                key={i}
                type='application/ld+json'
                dangerouslySetInnerHTML={{ __html: JSON.stringify(obj).replace(/</g, '\\u003c') }}
            />
        )}
    </>
}

function upsertMeta(attr, key, content) {
    let el = document.head.querySelector(`meta[${attr}="${key}"]`)
    if (!content) {
        el?.remove()
        return
    }
    if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, key)
        document.head.appendChild(el)
    }
    el.setAttribute('content', content)
}

export function applyHeadToDocument({ title, description, noindex, canonical, og }) {
    if (title) document.title = title

    upsertMeta('name', 'description', description)

    const robots = document.head.querySelector('meta[name="robots"]')
    if (noindex) {
        robots?.remove()
        const el = document.createElement('meta')
        el.setAttribute('name', 'robots')
        el.setAttribute('content', 'noindex')
        document.head.appendChild(el)
    } else {
        robots?.remove()
    }

    let link = document.head.querySelector('link[rel="canonical"]')
    if (!canonical) {
        link?.remove()
    } else {
        if (!link) {
            link = document.createElement('link')
            link.setAttribute('rel', 'canonical')
            document.head.appendChild(link)
        }
        link.setAttribute('href', canonical)
    }

    upsertMeta('property', 'og:title', og ? (og.title || title) : undefined)
    upsertMeta('property', 'og:description', og ? (og.description || description) : undefined)
    upsertMeta('property', 'og:url', og?.url)
    upsertMeta('property', 'og:type', og?.type)
    upsertMeta('property', 'og:image', og?.image)
}
