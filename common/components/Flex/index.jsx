import classNames from 'common/functions/classNames'
import styles from './flex.module.css'

/**
 * @typedef {Object} FlexOwnProps
 * @property {'center' | 'space-around' | 'space-between' | 'space-evenly' | 'start' | 'end'} justifyContent
 * @property {'center' | 'start' | 'end'} alignItems
 * @property {boolean} reverse
 * @property {boolean} center
 * @property {boolean} wrap
 * @property {boolean} col
 * @property {number} gap
 * @property {number} flexGrow
 * @property {string} className
 * @property {string} tag - The HTML tag to use for the wrapper element.
 */

export default function Flex({
    className,
    children,
    col = false,
    center = false,
    alignItems = '',
    justifyContent = '',
    wrap = false,
    reverse = false,
    gap = 0,
    grow,
    shrink,
    style = {},
    tag: Tag = 'div',
    ...props
}) {

    return <Tag
        className={classNames(
            className,
            styles.flex,
            [styles.wrap, wrap],
            [styles.reverse, reverse],
            styles[col ? 'col' : 'row'],
            styles[`ai-${alignItems || (center ? 'center' : '')}`],
            styles[`jc-${justifyContent || (center ? 'center' : '')}`]
        )}
        style={{ gap: gap || undefined, flexGrow: grow ? 1 : undefined, flexShrink: shrink, ...style }}
        {...props}
    >
        {children}
    </Tag>
}
