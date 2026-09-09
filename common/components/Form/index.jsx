import classNames from 'common/functions/classNames'
import styles from './form.module.css'
import { useState } from 'react'
import Button from '../Button'
import Text from '../Text'

export default function Form({ className = '', children, submitText, error, loading, action, noSubmit, onChange, autoComplete }) {
    const
        [actionLoading, setActionLoading] = useState(false),
        [actionError, setActionError] = useState('')

    async function submit(e) {
        e.preventDefault()
        e.stopPropagation()

        const invalidInputs = e.target.querySelectorAll('.Input_invalid')

        if (invalidInputs.length > 0) {
            try {
                invalidInputs[0].focus({ preventScroll: true })
                invalidInputs[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
            } catch (err) { }

            invalidInputs.forEach(element => element.classList.add('Input_visited'))
            return
        }

        if (typeof action == 'function') {
            const formData = getFormData(e)
            setActionError('')
            setActionLoading(true)
            try {
                await action(formData)
            } catch (err) {
                setActionError(err)
            } finally {
                setActionLoading(false)
            }
        }
    }

    function getFormData(e) {
        const formData = new FormData(e.target)
        const parsedData = {}
        for (const [key, value] of formData.entries()) {
            const keys = key.split('.')
            let current = parsedData
            for (let i = 0; i < keys.length - 1; i++) {
                if (!current[keys[i]]) {
                    current[keys[i]] = {}
                }
                current = current[keys[i]]
            }
            current[keys[keys.length - 1]] = value
        }
        return parsedData
    }

    function handleChange(e) {
        const formData = getFormData(e)
        onChange?.(formData)
    }

    const currentError = actionError?.message || actionError || error

    return <form
        onSubmit={submit}
        onChange={handleChange}
        className={classNames(styles.form, className)}
        autoComplete={autoComplete}
    >
        {children}
        <div className={styles.footer}>
            {currentError ? <Text size='l' mode='error' center className={styles.error}>{currentError}</Text> : null}
            {noSubmit ? null : <Button loading={loading || actionLoading} type='submit' size='xl'>{submitText || 'send'}</Button>}
        </div>
    </form>
}