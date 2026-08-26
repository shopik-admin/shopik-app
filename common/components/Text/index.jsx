import classNames from 'common/functions/classNames'
import { useText } from 'common/texts/TextProvider'
import styles from './text.module.css'
import { useMemo } from 'react'

export default function Text({ className = '', children, text = children, size = 'm', tag, bold, underline, mode, italic, lineThrough, ellipsis, center, style, ...props }) {
    const
        { TR } = (useText?.() || {}),
        Txt = tag || sizes[size],
        txt = typeof text != 'string' ? text : (TR?.(text) || text),
        mergedStyle = useMemo(
            () => ({ WebkitLineClamp: ellipsis, ...style }),
            [ellipsis, style]
        )

    return size == 'none' ? txt : <Txt
        className={classNames(
            className,
            styles.text,
            styles[size],
            [styles.bold, bold],
            [styles[mode], mode],
            [styles.italic, italic],
            [styles.center, center],
            [styles.underline, underline],
            [styles.lineThrough, lineThrough],
            [styles.ellipsis, ellipsis && ellipsis != '0'],
        )}
        style={mergedStyle}
        {...props}
    >{txt}</Txt>
}

const sizes = {
    xs: 'small',
    s: 'small',
    m: 'span',
    l: 'span',
    xl: 'span',
    xxl: 'span',
    p: 'p',
    h4: 'h4',
    h3: 'h3',
    h2: 'h2',
    h1: 'h1',
}

