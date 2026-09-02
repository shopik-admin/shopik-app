import classNames from 'common/functions/classNames'
import { useLists } from 'common/features/Lists'
import styles from './tabs.module.css'
import Button from '../Button'
import Badge from '../Badge'
import Text from '../Text'
import Flex from '../Flex'

export default function Tabs({
    className,
    style,
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
            {...props}
            className={classNames(styles.tabs, className)}
            style={{ '--active-index': activeIndex !== -1 ? activeIndex : 0, ...style }}
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
                const isDisabled = typeof opt === 'object' && !!opt.disabled

                const isActive = currentValue === value

                return <Button
                    key={value ?? i}
                    mode='text'
                    icon={opt.icon}
                    disabled={isDisabled}
                    aria-disabled={isDisabled}
                    className={`${styles.tab} ${isActive ? styles.active : ''} ${isDisabled ? styles.disabled : ''}`}
                    tooltip={opt.tooltip}
                    onClick={() => {
                        if (isDisabled) return
                        onChange?.(value)
                    }}
                >
                    <Text size='none'>{text}</Text>
                    <Badge>{opt.badge}</Badge>
                </Button>
            })}
        </Flex>
    )
}