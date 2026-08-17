import usePage from 'Pages/usePage'
import styles from './pageTitle.module.css'
import Text from 'common/components/Text'

export default function PageTitle({ }) {
    const { name } = usePage()
    return <Text size='h3' bold className={styles.pageTitle}>
        {name}
    </Text>
}
