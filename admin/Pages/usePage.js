import { useLocation, matchPath } from 'react-router'
import usePages from './index'

export default function usePage() {
    const
        { pathname } = useLocation(),
        pages = usePages()

    return pages.find(page =>
        matchPath({ path: page.path, end: true }, pathname)
    )
}