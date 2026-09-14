import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import styles from './detail.module.css'

export default function LabelChip({ label }) {
    const style = label.style || {}
    return <Flex gap={4} alignItems='center' className={styles.labelChip} style={{ backgroundColor: style.backgroundColor, color: style.color }}>
        {style.iconName && <Icon name={style.iconName} size={12} />}
        <Text size='s' bold style={{ color: style.color }}>{label.label || label.name}</Text>
    </Flex>
}
