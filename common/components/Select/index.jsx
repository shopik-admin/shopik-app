import { useMemo, useRef, useState } from 'react'
import { useLists } from 'common/features/Lists'
import { useText } from 'common/texts/TextProvider'
import Popover from '../Popover'
import Tabs from '../Tabs'
import Text from '../Text'
import Flex from '../Flex'
import Icon from '../Icon'
import classNames from 'common/functions/classNames'
import styles from './select.module.css'

function toFullOptions(list) {
    return (list || []).map(option => {
        if (option !== null && typeof option === 'object')
            return {
                text: option.text ?? option.value,
                value: String(option.value ?? option.text),
                disabled: option.disabled,
            }
        return { text: String(option), value: String(option) }
    })
}

function asStringArray(v) {
    if (v === undefined || v === null || v === '') return []
    return (Array.isArray(v) ? v : [v]).map(String)
}

/**
 * Static options picker with ygl Autocomplete behavior:
 * - Tabs when few options (single + <4, like ygl `tabsMode`)
 * - Popover box with search (when >=5 options), single/multi with removable chips
 *
 * Backward compatible with the old native <select> API:
 * onChange receives a synthetic event { target: { value, name, selectedOptions } }
 * so existing `e.target.value` / `Array.from(e.target.selectedOptions)` handlers keep working.
 */
export default function Select({
    options = [],
    value,
    defaultValue,
    onChange,
    multi,
    multiple,
    name,
    placeholder,
    noTabs = true,
    noSearch,
    disabled,
    required,
    onBlur,
    onFocus,
    autoFocus,
    className,
    style,
    ...rest
}) {
    const lists = useLists()
    const { TR } = useText?.() || {}
    const hiddenRef = useRef()
    const isMultiple = !!(multiple || multi)
    const [search, setSearch] = useState('')
    const [activeIndex, setActiveIndex] = useState(-1)

    let raw = typeof options === 'string' ? lists?.[options] : options
    if (!Array.isArray(raw)) raw = []
    const full = useMemo(() => toFullOptions(raw), [options, lists])

    // `{ value: '', disabled: true }` first option acts as placeholder (native pattern)
    const placeholderOpt = full.find(o => o.value === '' && o.disabled)
    const effective = useMemo(
        () => placeholderOpt ? full.filter(o => !(o.value === '' && o.disabled)) : full,
        [full]
    )
    const placeholderText = placeholder ?? placeholderOpt?.text ?? ''

    const [inner, setInner] = useState(() =>
        defaultValue !== undefined ? defaultValue : (isMultiple ? [] : '')
    )
    const current = value !== undefined ? value : inner

    const selectedValues = useMemo(() => {
        const arr = asStringArray(isMultiple ? current : (current ?? ''))
        // drop values that no longer exist (e.g. option removed after pick)
        return arr.filter(v => effective.some(o => o.value === v))
    }, [current, effective, isMultiple])
    const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues])
    const singleValue = isMultiple ? undefined : (selectedValues[0] ?? '')
    const singleOpt = isMultiple ? undefined : effective.find(o => o.value === singleValue)

    const displayText = v => {
        const opt = effective.find(o => o.value === v)
        const t = opt?.text ?? v
        return TR?.(t) ?? t
    }

    function emit(next) {
        if (value === undefined) setInner(next)
        const nextArr = isMultiple ? next : [next ?? '']
        onChange?.({
            target: {
                value: isMultiple ? next : (next ?? ''),
                name,
                type: isMultiple ? 'select-multiple' : 'select-one',
                selectedOptions: nextArr.filter(v => v !== '').map(v => ({ value: v })),
            },
        })
        if (hiddenRef.current)
            hiddenRef.current.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
    }

    function toggleItem(opt, close) {
        if (opt.disabled || disabled) return
        if (isMultiple) {
            const has = selectedSet.has(opt.value)
            emit(has ? selectedValues.filter(v => v !== opt.value) : [...selectedValues, opt.value])
            return // keep open for multi
        }
        if (singleValue === opt.value) {
            close?.()
            return
        }
        emit(opt.value)
        close?.()
    }

    function removeValue(v, e) {
        e?.stopPropagation()
        if (disabled) return
        if (isMultiple) emit(selectedValues.filter(x => x !== v))
        else emit('')
    }

    const showSearch = !noSearch && effective.length >= 5
    const suggestions = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return effective
        return effective.filter(o => {
            try {
                return String(TR?.(o.text) ?? o.text).toLowerCase().includes(q)
            } catch { return false }
        })
    }, [effective, search, TR])

    function openFromKeyboard(e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault()
            e.currentTarget.parentElement?.click()
        }
    }

    function onDropdownKeyDown(e, close) {
        if (e.key === 'Escape') {
            e.stopPropagation()
            close()
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            if (!suggestions.length) return
            setActiveIndex(i => {
                const d = e.key === 'ArrowDown' ? 1 : -1
                const next = i + d
                if (next < 0) return suggestions.length - 1
                if (next >= suggestions.length) return 0
                return next
            })
        } else if (e.key === 'Enter') {
            e.preventDefault()
            const opt = suggestions[activeIndex] ?? suggestions[0]
            if (opt) toggleItem(opt, close)
        }
    }

    const tabsMode = !noTabs && !isMultiple && effective.length >= 2 && effective.length < 4

    if (!Array.isArray(raw)) return null

    return <div className={classNames(styles.select, className)} style={style}>
        {tabsMode ? (
            <Tabs
                className={styles.tabs}
                options={effective}
                active={singleValue}
                onChange={v => !disabled && emit(String(v))}
            />
        ) : (
            <Popover
                disabled={disabled}
                btnClassName={styles.btnFull}
                className={styles.dropdown}
                button={
                    <Flex
                        justifyContent="space-between"
                        gap={5}
                        alignItems="center"
                        className={classNames(styles.box, [styles.disabledBox, disabled])}
                        role="combobox"
                        aria-expanded="false"
                        aria-disabled={disabled}
                        tabIndex={disabled ? -1 : 0}
                        autoFocus={autoFocus}
                        onBlur={onBlur}
                        onFocus={onFocus}
                        onKeyDown={openFromKeyboard}
                    >
                        <Flex alignItems="center" gap={5} wrap className={styles.tags}>
                            {selectedValues.length ? (
                                selectedValues.map(v => (
                                    <span key={v} className={styles.tag} title={displayText(v)}>
                                        <Text size="none" ellipsis="1">{displayText(v)}</Text>
                                        <span
                                            role="button"
                                            aria-label="remove"
                                            tabIndex={-1}
                                            className={styles.tagX}
                                            onClick={e => removeValue(v, e)}
                                        >
                                            <Icon name="x" />
                                        </span>
                                    </span>
                                ))
                            ) : (
                                <Text ellipsis="1" className={styles.placeholder}>
                                    {placeholderText || TR?.('choose') || 'בחירה'}
                                </Text>
                            )}
                        </Flex>
                        <Icon name="down" className={styles.chevron} />
                    </Flex>
                }
            >
                {({ close }) => (
                    <div className={styles.options} onKeyDown={e => onDropdownKeyDown(e, close)}>
                        {showSearch && (
                            <div className={styles.searchWrap}>
                                <Icon name="search" className={styles.searchIcon} />
                                <input
                                    type="search"
                                    value={search}
                                    autoComplete="off"
                                    placeholder={TR?.('search') || 'חיפוש..'}
                                    onChange={e => { setSearch(e.target.value); setActiveIndex(-1) }}
                                />
                            </div>
                        )}
                        <div className={styles.scroll}>
                            {suggestions.length === 0 ? (
                                <div className={styles.empty}><Text size="s">no_results</Text></div>
                            ) : suggestions.map((opt, i) => (
                                <div
                                    key={opt.value}
                                    role="option"
                                    aria-selected={selectedSet.has(opt.value)}
                                    aria-disabled={opt.disabled}
                                    onClick={() => toggleItem(opt, close)}
                                    className={classNames(
                                        styles.option,
                                        [styles.selected, selectedSet.has(opt.value)],
                                        [styles.optDisabled, opt.disabled],
                                        [styles.active, i === activeIndex],
                                    )}
                                >
                                    <Text size="none">{TR?.(opt.text) ?? opt.text}</Text>
                                    {!isMultiple && selectedSet.has(opt.value) && (
                                        <Icon name="v" className={styles.check} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </Popover>
        )}

        {name && (isMultiple
            ? selectedValues.map(v => (
                <input key={v} type="hidden" name={name} value={v} />
            ))
            : <input ref={hiddenRef} type="hidden" name={name} value={singleValue || ''} />
        )}
        {name && required && !isMultiple && (
            <input
                aria-hidden
                tabIndex={-1}
                required
                value={singleValue || ''}
                onChange={() => { }}
                className={styles.requiredProxy}
            />
        )}
    </div>
}
