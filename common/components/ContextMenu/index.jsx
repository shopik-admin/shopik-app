import classNames from 'common/functions/classNames'
import Button from 'common/components/Button'
import Popover from 'common/components/Popover'
import Loader from 'common/components/Loader'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import { useText } from 'common/texts/TextProvider'
import { useUser } from 'features/User'
import { useState } from 'react'
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
 * ContextMenu — ported from lavy `ui/components/ContextMenu`.
 *
 * Filters out `hide`d and permission-denied options, then renders nothing
 * for 0, an inline icon Button for 1, and a ⋯ popover menu for 2+.
 *
 * @param {Object} props
 * @param {Array} props.options - items: { text, icon, mode, separator|seperator, tooltip, disabled, hide, permission, onClick }
 * @param {boolean} [props.iconOnStart=false] - same as lavy: text first, icon at the end, space-between.
 * Pass `true` for icon-first, start-aligned layout.
 * @param {*} [props.row] - payload forwarded to `onClick` (lavy called this `pass`)
 * @param {*} [props.pass] - alias of `row` (lavy compat)
 */
export default function ContextMenu({ options = [], iconOnStart = true, row, pass, button, btnClassName, triggerIcon = 'options', ...popoverProps }) {
    const payload = pass ?? row
    const user = useUser()
    const { TR } = useText?.() || {}
    const { role = {}, isSuperAdmin } = user || {}
    // Item awaiting its async handler — shows the spinner, blocks re-clicks.
    const [pending, setPending] = useState(null)
    // Same rule as usePermission, but array-safe (no hooks in a loop).
    const can = p => !p || isSuperAdmin || role.permissions?.includes(p)
    const visible = options.filter(o => o && !o.hide && can(o.permission))

    if (!visible.length) return null

    // Single action renders inline (icon-only, like the old toolbar/row buttons).
    if (visible.length === 1) {
        const { hide, seperator, separator, text, permission, ...single } = visible[0]
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
                    itemKey = option.id ?? `${option.text}-${option.icon}-${idx}`,
                    hasSeparator = (option.separator ?? option.seperator) && idx > 0,
                    busy = option.loading || pending === itemKey,
                    disabled = option.disabled || busy

                // Sync handlers (e.g. opening a modal) close right away;
                // async ones keep the menu open with a spinner until they settle.
                function run(e) {
                    if (disabled || pending) return
                    e.stopPropagation()
                    e.preventDefault()
                    let result
                    try {
                        result = option.onClick?.(payload ?? e, e)
                    } catch (err) {
                        console.error(err)
                        close(e)
                        return
                    }
                    if (result && typeof result.then == 'function') {
                        setPending(itemKey)
                        result.then(
                            () => close(e),
                            err => { console.error(err); close(e) },
                        ).finally(() => setPending(null))
                    } else {
                        close(e)
                    }
                }

                return <Flex
                    key={itemKey}
                    role='menuitem'
                    tabIndex={disabled ? -1 : 0}
                    aria-disabled={disabled || undefined}
                    title={typeof option.tooltip == 'string' ? TR?.(option.tooltip) || option.tooltip : undefined}
                    alignItems='center'
                    reverse={iconOnStart}
                    gap={iconOnStart ? 12 : 20}
                    justifyContent={iconOnStart ? 'start' : 'space-between'}
                    className={classNames(
                        styles.menuItem,
                        normalizeMode(option.mode),
                        [styles.seperator || styles.separator, hasSeparator],
                        [styles.disabled, disabled],
                    )}
                    onClick={run}
                    onKeyDown={e => {
                        if (disabled || pending) return
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            run(e)
                        }
                    }}
                >
                    <Text size='l' ellipsis>{option.text}</Text>
                    {busy ? <Loader size={16} className={styles.loaderSlot} /> :
                        typeof option.icon == 'string'
                            ? <Icon name={option.icon} className={styles.icon} />
                            : option.icon}
                </Flex>
            })}
        </div>}
    </Popover>
}
