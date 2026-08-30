import { useState, useEffect } from 'react'
import Input from 'common/components/Input'
import Button from 'common/components/Button'
import styles from './settings.module.css'

function toEntries(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    return Object.entries(value).map(([k, v]) => ({ key: k, value: v == null ? '' : String(v) }))
}

function fromEntries(entries) {
    const obj = {}
    entries.forEach(({ key, value }) => {
        if (key) obj[key] = value
    })
    return obj
}

export default function ConfigEditor({ value, onChange, disabled }) {
    const [entries, setEntries] = useState(() => toEntries(value))
    const [newKey, setNewKey] = useState('')
    const [newVal, setNewVal] = useState('')

    useEffect(() => {
        setEntries(toEntries(value))
    }, [value])

    function emit(nextEntries) {
        setEntries(nextEntries)
        onChange(fromEntries(nextEntries))
    }

    function updateEntry(idx, field, val) {
        const next = entries.map((e, i) => i === idx ? { ...e, [field]: val } : e)
        emit(next)
    }

    function removeEntry(idx) {
        const next = entries.filter((_, i) => i !== idx)
        emit(next)
    }

    function addEntry() {
        if (!newKey.trim()) return
        if (entries.some(e => e.key === newKey.trim())) return
        const next = [...entries, { key: newKey.trim(), value: newVal }]
        setNewKey('')
        setNewVal('')
        emit(next)
    }

    return (
        <div className={styles.configEditor}>
            {entries.length === 0 && <div className={styles.emptyValue}>No keys — add below</div>}
            {entries.map((e, idx) => (
                <div key={idx} className={styles.configRow}>
                    <Input
                        value={e.key}
                        onChange={(ev) => updateEntry(idx, 'key', ev.target.value)}
                        placeholder="key"
                        disabled={disabled}
                    />
                    <Input
                        value={e.value}
                        onChange={(ev) => updateEntry(idx, 'value', ev.target.value)}
                        placeholder="value"
                        disabled={disabled}
                    />
                    <Button icon="delete" mode="text" onClick={() => removeEntry(idx)} disabled={disabled} title="Remove" />
                </div>
            ))}
            <div className={styles.configRow}>
                <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="new key" disabled={disabled} />
                <Input value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder="new value" disabled={disabled} />
                <Button icon="add" size="s" onClick={addEntry} disabled={disabled || !newKey.trim()}>Add</Button>
            </div>
        </div>
    )
}
