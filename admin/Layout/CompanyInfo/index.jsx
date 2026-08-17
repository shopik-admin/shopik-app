import styles from './companyInfo.module.css'
import Flex from 'common/components/Flex'
import Icon from 'common/components/Icon'
import Text from 'common/components/Text'
import { useSidebar } from '../Sidebar'

export default function CompanyInfo({ }) {
    const { mini } = useSidebar()
    return <Flex gap={10} center className={styles.companyInfo}>
        <Icon name='cart' />
        {mini ? null : <Text size='h2'>
            company name
        </Text>}
    </Flex>
}
