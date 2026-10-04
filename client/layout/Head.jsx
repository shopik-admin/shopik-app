export default function Head({ title = '', description = '', noindex = false, favicon, faviconDark }) {
    return <>
        <title>{title}</title>
        <meta name='description' content={description} />
        {noindex && <meta name='robots' content='noindex' />}
        {favicon && <link rel="icon" href={favicon} />}
        {faviconDark && <link rel="icon" href={faviconDark} media="(prefers-color-scheme: dark)" />}
    </>
}
