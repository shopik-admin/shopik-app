import Text from '#common/components/Text/index.jsx'
import { useText } from 'common/texts/TextProvider'
import styles from './dataCount.module.css'
import { useData } from '../DataProvider'

export default function DataCount() {
    const
        { count, data } = useData(),
        { TR } = (useText?.() || {})

    if (count == null) return null

    const shown = data?.length || 0
    return <Text size='s' mode='sub' className={styles.dataCount}>
        {shown < count ? `${shown} ${TR('from')} ${count} ${TR('rows')}` : `${count} ${TR('rows')}`}
    </Text>
}
