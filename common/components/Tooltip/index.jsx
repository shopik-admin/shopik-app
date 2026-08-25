import classNames from 'common/functions/classNames'
import { useText } from 'common/texts/TextProvider'
import styles from './tooltip.module.css'

export default function Tooltip({ text, position = 'top', children, className }) {
    const { TR } = useText?.() || {}
    const tip = text ? (TR?.(text) || text) : null

    if (!tip) return children

    return (
        <span
            className={classNames(styles.wrapper, className)}
            data-tip={tip}
            data-position={position}
        >
            {children}
        </span>
    )
}
