import { Link } from 'react-router'
import Flex from '#common/components/Flex'
import Text from '#common/components/Text'
import Button from '#common/components/Button'
import styles from './notFound.module.css'

export default function NotFound() {
    return <Flex col center gap={12} className={styles.notFound}>
        <Text size='h1' bold>404</Text>
        <Text size='h2' bold>העמוד לא נמצא</Text>
        <Text mode='sub'>נראה שהדף שחיפשת לא קיים או שהוסר מהאתר</Text>
        <Link to='/'><Button>לדף הבית</Button></Link>
    </Flex>
}
