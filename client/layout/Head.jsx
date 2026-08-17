import { usePage } from 'layout/Page'
import { useEffect } from 'react'

export default function Head() {
    const { title, description } = usePage()

    const finalTitle = title ? `${title} | שם החנות` : 'שם החנות'

    useEffect(() => {
        if (typeof window !== 'undefined') {
            document.title = finalTitle
            const meta = document.querySelector('meta[name="description"]')
            if (meta) meta.setAttribute('content', description || '')
        }
    }, [finalTitle, description])

    return (
        <>
            <title>{finalTitle}</title>
            <meta name="description" content={description || ''} />
        </>
    )
}