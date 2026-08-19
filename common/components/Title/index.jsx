import Flex from '../Flex'
import Text from '../Text'
import styles from './title.module.css'

export default function Title({ children, subtitle, center = true, ...props }) {
    return <Flex col className={styles.title} center={center} gap={10} {...props} >
        <Text size='h4' bold>{children}</Text>
        {subtitle && <Text size='l' mode='sub'>{subtitle}</Text>}
    </Flex>
}
