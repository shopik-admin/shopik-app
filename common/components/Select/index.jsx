import { useLists } from 'common/features/Lists'
import Text from 'common/components/Text'
import styles from './select.module.css'
import Icon from '../Icon'

export default function Select({ options = [], multi, chips, ...props }) {
    const lists = useLists()
    if (typeof options == 'string')
        options = lists[options]

    if (!Array.isArray(options))
        return null

    return <div className={styles.select}>
        <select  {...props}>
            {options.map((opt, i) => {
                const text = typeof opt === 'object' ? (opt.text ?? opt.value) : opt
                const value = typeof opt === 'object' ? (opt.value ?? opt.text) : opt

                return <option key={i} value={value}>
                    <Text size='none'>
                        {text}
                    </Text>
                </option>
            })}

        </select>
        <Icon name='down' className={styles.chevron} />
    </div>
}