import classNames from 'common/functions/classNames'
import styles from './form.module.css'
import Loader from '../Loader'
import Button from '../Button'
import Text from '../Text'

export default function Form({ className = '', children, submitText, error, loading, action, noSubmit, onChange }) {

    function submit(e) {
        e.preventDefault()

        const invalidInputs = e.target.querySelectorAll('.Input_invalid')

        if (!invalidInputs.length) {
            const formData = new FormData(e.target)
            return action?.(Object.fromEntries(formData))
        }

        try {
            invalidInputs[0].focus({ preventScroll: true })
            invalidInputs[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
        } catch (error) { }

        invalidInputs.forEach(element => element.classList.add('Input_visited'))
    }

    function handleChange(e) {
        const formData = new FormData(e.currentTarget)
        onChange?.(Object.fromEntries(formData))
    }

    return <form
        onSubmit={submit}
        onChange={handleChange}
        className={classNames(styles.form, className)}
    >
        {children}
        <div className={styles.footer}>
            {error ? <Text size='l' mode='error' center className={styles.error}>{error}</Text> : ''}
            {noSubmit ? null :
                (loading ? <Loader size={20} /> :
                    <Button size='xl'>{submitText || 'send'}</Button>)}
        </div>
    </form>
}
