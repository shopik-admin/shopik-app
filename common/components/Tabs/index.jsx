import { useLists } from 'common/features/Lists'
import styles from './tabs.module.css'
import Button from '../Button'
import Flex from '../Flex'

export default function Tabs({
    options = [],
    active,
    defaultValue,
    onChange,
    ...props
}) {
    const lists = useLists()

    if (typeof options === 'string')
        options = lists[options]

    // Normalize options
    if (!Array.isArray(options) || options.length === 0)
        return null

    const getValue = (opt) =>
        typeof opt === 'object'
            ? (opt.value ?? opt.text)
            : opt

    const getText = (opt) =>
        typeof opt === 'object'
            ? (opt.text ?? opt.value)
            : opt

    // Fallback to defaultValue or the first option's value if completely uncontrolled
    const currentValue = active !== undefined ? active : (defaultValue ?? getValue(options[0]))

    const activeIndex = options.findIndex(
        (opt) => getValue(opt) === currentValue
    )

    return (
        <Flex
            className={styles.tabs}
            style={{ '--active-index': activeIndex !== -1 ? activeIndex : 0 }}
            {...props}
        >
            {/* Moving indicator */}
            <div
                className={styles.indicator}
                style={{
                    width: `${100 / options.length}%`,
                }}
            />

            {options.map((opt, i) => {
                const text = getText(opt)
                const value = getValue(opt)

                const isActive = currentValue === value

                return (
                    <Button
                        key={value ?? i}
                        mode='text'
                        icon={opt.icon}
                        className={`${styles.tab} ${isActive ? styles.active : ''}`}
                        onClick={() => {
                            onChange?.(value)
                        }}
                    >
                        {text}
                    </Button>
                )
            })}
        </Flex>
    )
}