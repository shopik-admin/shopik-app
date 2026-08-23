import usePermission from 'common/permissions/usePermision'
import classNames from 'common/functions/classNames'
import Loader from 'common/components/Loader'
import Icon from 'common/components/Icon'
import Text from 'common/components/Text'
import styles from './button.module.css'
import { useState } from 'react'

export default function Button({
    className, text = '', children = text, icon, mode, loading: externalLoading = false,
    onClick, stopPropagation, preventDefault, permission, onError, onPrimary, ...props
}) {
    const hasPermission = usePermission(permission || '')
    const [loading, setLoading] = useState(false)

    if (permission && !hasPermission) return null

    return <button
        className={classNames(
            className,
            styles.button,
            [styles[mode], mode],
            [styles.onPrimary, onPrimary],
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
