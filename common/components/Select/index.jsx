import { useLists } from 'common/features/Lists'
import Text from 'common/components/Text'
import styles from './select.module.css'
import Icon from '../Icon'

export default function Select({ options = [], multi, chips, className, style, ...props }) {
    const lists = useLists()
    if (typeof options == 'string')
        options = lists[options]

    if (!Array.isArray(options))
        return null

    const isMultiple = props.multiple || multi

    return <div className={[styles.select, className].filter(Boolean).join(' ')} style={style}>
        <select {...props} multiple={isMultiple || undefined}>
            {options.map((opt, i) => {
                const text = typeof opt === 'object' ? (opt.text ?? opt.value) : opt
                const value = typeof opt === 'object' ? (opt.value ?? opt.text) : opt
                const disabled = typeof opt === 'object' ? opt.disabled : undefined

                return <option key={i} value={value} disabled={disabled}>
                    <Text size='none'>
                        {text}
                    </Text>
                </option>
            })}

        </select>
        {!isMultiple && <Icon name='down' className={styles.chevron} />}
    </div>
}