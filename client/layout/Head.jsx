export default function Head({ title = '', description = '', noindex = false, favicon, faviconDark, meta }) {
    return <>
        <title>{title}</title>
        <meta name='description' content={description} />
        {meta && <>
            {meta.title && <meta property="og:title" content={meta.title} />}
            {meta.description && <meta property="og:description" content={meta.description} />}
            {meta.image && <meta property="og:image" content={meta.image} />}
            {meta.url && <meta property="og:url" content={meta.url} />}
            {meta.type && <meta property="og:type" content={meta.type} />}
            {meta.siteName && <meta property="og:site_name" content={meta.siteName} />}
            {meta.twitterCard && <meta name="twitter:card" content={meta.twitterCard} />}
            {meta.title && <meta name="twitter:title" content={meta.title} />}
            {meta.description && <meta name="twitter:description" content={meta.description} />}
            {meta.image && <meta name="twitter:image" content={meta.image} />}
        </>}
        {noindex && <meta name='robots' content='noindex' />}
        {favicon && <link rel="icon" href={favicon} />}
        {faviconDark && <link rel="icon" href={faviconDark} media="(prefers-color-scheme: dark)" />}
    </>
}
