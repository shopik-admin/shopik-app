import Flex from '#common/components/Flex/index.jsx'
import Text from '#common/components/Text/index.jsx'
import styles from './breadcrumbs.module.css'
import { Link } from 'react-router'


export default function Breadcrumbs({ path = '/' }) {
    const parts = path.split('/').filter(Boolean)
    return <Flex tag='nav' align='center' className={styles.breadcrumbs}>
        {/*  <Link to="/">Home</Link> */}
        {parts.map((part, i) => /* (i == parts.length - 1) ? null : */
            <Link key={i} to={`/${parts.slice(0, i + 1).join('/')}`}>
                <Text size='s'>
                    {part}
                </Text>
            </Link>
        )}
    </Flex>
} 