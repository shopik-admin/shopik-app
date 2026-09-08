import classNames from 'common/functions/classNames'
import Button from 'common/components/Button'
import Popover from 'common/components/Popover'
import Loader from 'common/components/Loader'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import styles from './contextMenu.module.css'

const dangerModes = new Set(['red', 'danger', 'error'])
const brandModes = new Set(['color1', 'brand', 'primary'])

function normalizeMode(mode) {
    if (!mode) return ''
    if (dangerModes.has(mode)) return styles.danger
    if (brandModes.has(mode)) return styles.brand
    return styles[mode] || ''
}

/** 
 *
 * @param {Object} props
 * @param {Array} props.options - items: { text, icon, mode, separator|seperator, tooltip, disabled, hide, onClick }
 * @param {boolean} [props.iconOnStart=false] - same as lavy: text first, icon at the end, space-between.
 * Pass `true` for icon-first, start-aligned layout.
 * @param {*} [props.row] - payload forwarded to `onClick` (lavy called this `pass`)
 * @param {*} [props.pass] - alias of `row` (lavy compat)
 */
export default function ContextMenu({ options = [], iconOnStart = true, row, pass, button, btnClassName, triggerIcon = 'options', ...popoverProps }) {
    const payload = pass ?? row
    const visible = options.filter(Boolean).filter(o => !o.hide)

    if (!visible.length) return null

    // Single action renders inline instead of a one-item menu.
    if (visible.length === 1) {
        const [{ hide, seperator, separator, ...single }] = visible[0]
        return <Button preventDefault stopPropagation {...single} />
    }

    function onKeyDown(e, close) {
        const items = Array.from(e.currentTarget.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])'))
        const idx = items.indexOf(document.activeElement)
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            items[(idx + 1) % items.length]?.focus()
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            items[(idx - 1 + items.length) % items.length]?.focus()
        } else if (e.key === 'Home') {
            e.preventDefault()
            items[0]?.focus()
        } else if (e.key === 'End') {
            e.preventDefault()
            items.at(-1)?.focus()
        } else if (e.key === 'Escape') {
            e.preventDefault()
            close()
        }
    }

    return <Popover
        button={button || <Button mode='text' icon={triggerIcon} />}
        btnClassName={btnClassName}
        {...popoverProps}
    >
        {({ close }) => <div className={styles.contextMenu} role='menu' onKeyDown={e => onKeyDown(e, close)}>
            {visible.map((option, idx) => {
                const
                    hasSeparator = (option.separator ?? option.seperator) && idx > 0,
                    disabled = option.disabled || option.loading

                return <Flex
                    key={option.id ?? `${option.text}-${option.icon}-${idx}`}
                    role='menuitem'
                    tabIndex={disabled ? -1 : 0}
                    aria-disabled={disabled || undefined}
                    title={typeof option.tooltip == 'string' ? option.tooltip : undefined}
                    alignItems='center'
                    gap={iconOnStart ? 12 : 20}
                    justifyContent={iconOnStart ? 'start' : 'space-between'}
                    className={classNames(
                        styles.menuItem,
                        normalizeMode(option.mode),
                        [styles.separator, hasSeparator],
                        [styles.disabled, disabled],
                    )}
                    onClick={async e => {
                        if (disabled) return
                        e.stopPropagation()
                        e.preventDefault()
                        try {
                            await option.onClick?.(payload ?? e, e)
                        } catch (err) {
                            console.error(err)
                        } finally {
                            close()
                        }
                    }}
                    onKeyDown={e => {
                        if (disabled) return
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            e.currentTarget.click()
                        }
                    }}
                >{option.loading ? <Loader size={16} /> :
                    typeof option.icon == 'string'
                        ? <Icon name={option.icon} className={styles.icon} />
                        : option.icon}
                    <Text size='l' ellipsis>{option.text}</Text>

                </Flex>
            })}
        </div>}
    </Popover>
}
