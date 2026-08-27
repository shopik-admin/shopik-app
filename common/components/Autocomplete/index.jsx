import { useEffect, useRef, useState } from 'react'
import Input from '../Input'
import Flex from '../Flex'
import Text from '../Text'
import Loader from '../Loader'
import styles from './autocomplete.module.css'

export default function Autocomplete({
    label,
    placeholder,
    value,
    defaultValue,
    onSelect,
    onChange,
    fetchOptions,
    disabled,
    required,
    debounceMs = 200,
    name,
    minChars = 1,
}) {
    const initialQuery = value ?? defaultValue ?? ''
    const [query, setQuery] = useState(initialQuery)
    const [options, setOptions] = useState([])
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [activeIndex, setActiveIndex] = useState(-1)
    const [errorMsg, setErrorMsg] = useState('')
    const containerRef = useRef()
    const timerRef = useRef()
    const lastSelectedRef = useRef(null)
    const hasInteractedRef = useRef(false)

    useEffect(() => {
        if (value !== undefined) setQuery(value)
    }, [value])

    useEffect(() => {
        if (!fetchOptions) return
        if (!hasInteractedRef.current) return
        if (lastSelectedRef.current && query === lastSelectedRef.current) {
            // Just selected — stop fetching the same value
            setOptions([])
            setOpen(false)
            return
        }
        // New typing, clear the just-selected guard
        if (lastSelectedRef.current && query !== lastSelectedRef.current) {
            lastSelectedRef.current = null
        }
        if (query.trim().length < minChars) {
            setOptions([])
            setOpen(false)
            return
        }
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(async () => {
            setLoading(true)
            setOpen(true)
            try {
                const res = await fetchOptions(query)
                setOptions(Array.isArray(res) ? res : [])
                setActiveIndex(-1)
            } catch {
                setOptions([])
            } finally {
                setLoading(false)
            }
        }, debounceMs)
        return () => clearTimeout(timerRef.current)
    }, [query])

    useEffect(() => {
        function onDocClick(e) {
            if (!containerRef.current?.contains(e.target)) setOpen(false)
        }
        document.addEventListener('click', onDocClick)
        return () => document.removeEventListener('click', onDocClick)
    }, [])

    function handleInputChange(e) {
        const v = e?.target ? e.target.value : e
        hasInteractedRef.current = true
        setErrorMsg('')
        setQuery(v)
        onChange?.(v)
    }

    function handleSelect(opt) {
        const label = typeof opt === 'object' ? (opt.label ?? opt.text ?? opt.value) : opt
        lastSelectedRef.current = label
        hasInteractedRef.current = true
        setErrorMsg('')
        setQuery(label)
        setOptions([])
        setOpen(false)
        onSelect?.(opt)
        onChange?.(label)
    }

    function handleBlur() {
        // Keep what user typed, but show error if not a valid selection
        setTimeout(() => {
            if (!hasInteractedRef.current) return
            if (!query) {
                setErrorMsg('')
                return
            }
            if (lastSelectedRef.current && query === lastSelectedRef.current) {
                setErrorMsg('')
                return
            }
            const match = options.find(opt => {
                const label = typeof opt === 'object' ? (opt.label ?? opt.text ?? opt.value) : String(opt)
                return label.trim().toLowerCase() === query.trim().toLowerCase()
            })
            if (match) {
                handleSelect(match)
                return
            }
            if (loading) {
                setTimeout(handleBlur, 300)
                return
            }
            // No exact match — keep "ירו" but show input error (do not delete)
            setErrorMsg('select_from_list')
            setOpen(false)
        }, 180)
    }

    function handleKeyDown(e) {
        if (!open || !options.length) return
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIndex(i => Math.min(i + 1, options.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIndex(i => Math.max(i - 1, 0))
        } else if (e.key === 'Enter') {
            e.preventDefault()
            if (activeIndex >= 0) handleSelect(options[activeIndex])
        } else if (e.key === 'Escape') {
            setOpen(false)
        }
    }

    return <div ref={containerRef} className={styles.autocomplete} onKeyDown={handleKeyDown}>
        <Input
            label={label}
            placeholder={placeholder}
            name={name}
            value={query}
            defaultValue={undefined}
            onChange={handleInputChange}
            onBlur={handleBlur}
            onFocus={() => { if (options.length || loading) setOpen(true) }}
            disabled={disabled}
            required={required}
            autoComplete="nope"
            data-lpignore="true"
            data-form-type="other"
            spellCheck="false"
        />
        {errorMsg && <Text size="s" mode="error" className={styles.error}>{errorMsg}</Text>}
        {open && (
            <div className={styles.dropdown}>
                {loading
                    ? <div className={styles.loaderWrap}><Loader size={18} /></div>
                    : options.length === 0
                        ? <div className={styles.empty}><Text size="s">no_results</Text></div>
                        : options.map((opt, i) => {
                            const label = typeof opt === 'object' ? (opt.label ?? opt.text ?? opt.value) : opt
                            return <div
                                key={i}
                                className={`${styles.option} ${i === activeIndex ? styles.active : ''}`}
                                onMouseDown={(e) => { e.preventDefault(); handleSelect(opt) }}
                            >
                                {label}
                            </div>
                        })}
            </div>
        )}
    </div>
}
