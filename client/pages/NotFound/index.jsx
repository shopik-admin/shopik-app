import { Link } from 'react-router'
import Flex from '#common/components/Flex'
import Text from '#common/components/Text'
import Button from '#common/components/Button'
import styles from './notFound.module.css'

export default function NotFound() {
    return <Flex col center gap={12} className={styles.notFound}>
        <Text size='h1' bold>404</Text>
        <Text size='h2' bold>page_not_found</Text>
        <Text mode='sub'>page_not_found_subtitle</Text>
        <Link to='/'><Button>to_home_page</Button></Link>
    </Flex>
}
