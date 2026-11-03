export default function Head({
    title = '',
    description = '',
    noindex = false,
    favicon,
    faviconDark,
    appleTouchIcon,
    themeColor,
    appTitle
}) {
    const appleIcon = appleTouchIcon || favicon
    return <>
        <title>{title}</title>
        <meta name='description' content={description} />
        {noindex && <meta name='robots' content='noindex' />}
        {themeColor && <meta name='theme-color' content={themeColor} />}
        {appTitle && <meta name='apple-mobile-web-app-title' content={appTitle} />}
        {favicon && <link rel="icon" href={favicon} />}
        {faviconDark && <link rel="icon" href={faviconDark} media="(prefers-color-scheme: dark)" />}
        {appleIcon && <link rel="apple-touch-icon" href={appleIcon} />}
    </>
}
