import Flex from '#common/components/Flex/index.jsx'
import Text from '#common/components/Text/index.jsx'
import toSlug from '#common/functions/toSlug.js'
import styles from './breadcrumbs.module.css'
import { Link } from 'react-router'
import { useAppData } from 'App'


export default function Breadcrumbs({ path = '/', hideLast = false }) {
    const { menu } = useAppData() || {}
    const parts = path.split('/').filter(Boolean)

    let level = menu
    const crumbs = parts.map(part => {
        const match = level?.find(node => node?.name && toSlug(node.name) === part.toLowerCase())
        level = match?.children
        return { part, name: match?.name }
    })
    const visible = hideLast ? crumbs.slice(0, -1) : crumbs

    return <Flex tag='nav' aria-label='breadcrumb' align='center' className={styles.breadcrumbs}>
        <ol className={styles.list}>
            {visible.map(({ part, name }, i) =>
                <li
                    key={i}
                    className={styles.item}
                    {...(i === visible.length - 1 ? { 'aria-current': 'page' } : {})}
                >
                    <Link to={`/${parts.slice(0, i + 1).join('/')}`}>
                        <Text size='s'>
                            {name || part.replaceAll('-', ' ')}
                        </Text>
                    </Link>
                </li>
            )}
        </ol>
    </Flex>
}
