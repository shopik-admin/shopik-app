import Flex from 'common/components/Flex'
import Button from 'common/components/Button'
import Text from 'common/components/Text'
import styles from './stepper.module.css'
import classNames from 'common/functions/classNames'

export default function Stepper({ value = 0, onChange, min = 0, max, step = 1, className, disabled, ...props }) {
    const dec = () => {
        if (disabled) return
        const next = Math.max(min, Number(value) - step)
        if (max != null && next > max) return
        onChange?.(next)
    }
    const inc = () => {
        if (disabled) return
        const next = Number(value) + step
        if (max != null && next > max) return
        if (next < min) return
        onChange?.(next)
    }
    return <Flex alignItems="center" gap={8} className={classNames(styles.stepper, className)} {...props}>
        <Button mode="outline" onClick={dec} disabled={disabled || Number(value) <= min} className={styles.stepBtn} aria-label="decrease">−</Button>
        <Text bold className={styles.stepValue}>{value}</Text>
        <Button mode="outline" onClick={inc} disabled={disabled} className={styles.stepBtn} aria-label="increase">+</Button>
    </Flex>
}
