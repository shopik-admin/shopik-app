export default function Head({ title = '', description = '', noindex = false }) {
    return <>
        <title>{title}</title>
        <meta name='description' content={description} />
        {noindex && <meta name='robots' content='noindex' />}
    </>
}
