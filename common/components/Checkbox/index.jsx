import classNames from 'common/functions/classNames'
import { useEffect, useRef, useState } from 'react'
import styles from './checkbox.module.css'
import Text from '../Text'

export default function Checkbox({ className = '', name, label, switchMode, tagMode, children, defaultValue, defaultChecked = defaultValue, checked, indeterminate = false, disabled = false, onChange, }) {
    const
        isControlled = checked !== undefined,
        inputRef = useRef(),
        [innerChecked, setInnerChecked] = useState(defaultChecked)

    useEffect(() => {
        if (isControlled) {
            setInnerChecked(checked)
        }
    }, [checked, isControlled])

    // Native indeterminate state so screen readers and the browser agree with
    // the partial-selection visuals (a filled box with a dash).
    useEffect(() => {
        if (inputRef.current) inputRef.current.indeterminate = indeterminate
    }, [indeterminate])

    function toggleChecked(e) {
        if (!isControlled) {
            setInnerChecked(e.target.checked)
        }
        onChange?.(e)
    }

    const mode = switchMode ? 'switch' : tagMode ? 'tag' : 'checkbox'

    return <label
        className={classNames(
            className,
            styles.cb,
            styles[mode],
            [styles.checked, innerChecked],
            [styles.indeterminate, indeterminate],
            [styles.disabled, disabled]
        )}
    >
        <input
            ref={inputRef}
            type="checkbox"
            name={name}
            disabled={disabled || undefined}
            checked={isControlled ? checked : undefined}
            defaultChecked={!isControlled ? defaultChecked : undefined}
            onChange={toggleChecked}
        />

        <span className={styles.checkboxCircle}>
            <span className={styles.checkMark}>{indeterminate ? '−' : '✓'}</span>
        </span>

        <Text size='none'>{children || label}</Text>
    </label>
}