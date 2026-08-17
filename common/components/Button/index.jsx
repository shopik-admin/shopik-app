import usePermission from 'common/permissions/usePermision'
import classNames from 'common/functions/classNames'
import styles from './button.module.css'
import Icon from '../Icon'
import Text from '../Text'
import { useState } from 'react'
import Loader from '../Loader'

export default function Button({
    className, text = '', children = text, icon, mode, loading: externalLoading = false,
    onClick, stopPropagation, preventDefault, permission, onError, ...props
}) {
    if (permission && !usePermission(permission)) return null

    const [loading, setLoading] = useState(false)

    return <button
        className={classNames(
            className,
            styles.button,
            [styles[mode], mode],
        )}
        onClick={async e => {
            if (loading || !onClick) return
            if (stopPropagation) e.stopPropagation()
            if (preventDefault) e.preventDefault()
            setLoading(true)
            try {
                await onClick(e)
            } catch (error) {
                console.error(error)
                if (onError) onError(error)
            } finally {
                setLoading(false)
            }
        }}
        {...props}
    >
        {loading || externalLoading ? <Loader size={16} /> : <>
            {icon && <Icon name={icon} />}
            {typeof children == 'string' ? <Text size='none'>{children}</Text> : children}
        </>}
    </button>
}
