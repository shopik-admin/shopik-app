import classNames from 'common/functions/classNames'
import { useRef, useState } from 'react'
import styles from './form.module.css'
import Button from '../Button'
import Text from '../Text'

export default function Form({ className = '', children, submitText, error, loading, action, onSubmit, noSubmit, actions, onChange, autoComplete, sticky, stickyFooter }) {
    const
        form = useRef(),
        [actionLoading, setActionLoading] = useState(false),
        [actionError, setActionError] = useState(''),
        run = action || onSubmit

    function setDeep(obj, dottedKey, value) {
        const keys = String(dottedKey).split('.')
        let current = obj
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]] || typeof current[keys[i]] !== 'object') current[keys[i]] = {}
            current = current[keys[i]]
        }
        current[keys[keys.length - 1]] = value
    }

    function getValues() {
        const values = {}
        Object.values(form.current?.elements || {}).forEach(el => {
            const { name, value, type, checked, files, multiple, disabled } = el || {}
            if (!name || disabled) return
            if (type == 'file') {
                if (value) setDeep(values, name, files)
                return
            }
            if (type == 'checkbox') {
                setDeep(values, name, checked === true)
                return
            }
            if (type == 'radio') {
                if (checked) setDeep(values, name, (value !== 'on' && value !== '') ? value : true)
                return
            }
            try { setDeep(values, name, multiple ? JSON.parse(value) : value) }
            catch { setDeep(values, name, value) }
        })
        return values
    }

    async function submit(e) {
        e.preventDefault()
        e.stopPropagation()

        const invalidInputs = form.current?.querySelectorAll('.Input_invalid')
        if (invalidInputs?.length > 0) {
            try {
                invalidInputs[0].focus({ preventScroll: true })
                invalidInputs[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
            } catch (err) { }
            invalidInputs.forEach(element => element.classList.add('Input_visited'))
            return
        }

        if (typeof run == 'function') {
            setActionError('')
            setActionLoading(true)
            try {
                await run(getValues())
            } catch (err) {
                setActionError(err)
            } finally {
                setActionLoading(false)
            }
        }
    }

    const currentError = actionError?.message || actionError || error

    return <form
        ref={form}
        onSubmit={submit}
        onChange={() => onChange?.(getValues())}
        className={classNames(styles.form, className, [styles.sticky, sticky || stickyFooter])}
        autoComplete={autoComplete}
    >
        {children}
        <div className={styles.footer}>
            {currentError ? <Text size='l' mode='error' center className={styles.error}>{currentError}</Text> : null}
            {noSubmit && !actions ? null :
                <div className={styles.actions}>
                    {!noSubmit && <Button loading={loading || actionLoading} type='submit' size='xl'>{submitText || 'send'}</Button>}
                    {actions}
                </div>}
        </div>
    </form>
}
