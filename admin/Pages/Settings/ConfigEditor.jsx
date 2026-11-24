import { useState, useEffect } from 'react'
import Input from 'common/components/Input'
import Button from 'common/components/Button'
import { useText } from 'common/texts/TextProvider'
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

export default function ConfigEditor({ value, onChange, disabled, canEditKeys = true, canEditValues = true }) {
    const { TR } = useText()
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
        // keys are view-only when canEditKeys is false
        if (field === 'key' && !canEditKeys) return
        if (field === 'value' && !canEditValues && !canEditKeys) return
        const next = entries.map((e, i) => i === idx ? { ...e, [field]: val } : e)
        emit(next)
    }

    function removeEntry(idx) {
        if (!canEditKeys || disabled) return
        const next = entries.filter((_, i) => i !== idx)
        emit(next)
    }

    function addEntry() {
        if (!canEditKeys || disabled) return
        if (!newKey.trim()) return
        if (entries.some(e => e.key === newKey.trim())) return
        const next = [...entries, { key: newKey.trim(), value: newVal }]
        setNewKey('')
        setNewVal('')
        emit(next)
    }

    const canAddRemove = canEditKeys && !disabled
    const valDisabled = disabled || (!canEditValues && !canEditKeys)

    const isReadonlyKeys = !canEditKeys
    return (
        <div className={`${styles.configEditor} ${isReadonlyKeys ? styles.configEditorReadonly : ''}`}>
            {entries.length === 0 && <div className={styles.emptyValue}>{TR('settings_config_empty')}</div>}
            {entries.map((e, idx) => (
                <div key={idx} className={`${styles.configRow} ${!canEditKeys ? styles.configRowReadonly : ''}`}>
                    {canEditKeys ? (
                        <Input
                            value={e.key}
                            onChange={(ev) => updateEntry(idx, 'key', ev.target.value)}
                            placeholder={TR('settings_config_key')}
                            disabled={disabled}
                        />
                    ) : (
                        <span className={styles.configKeyLabel} title={TR('settings_config_keys_readonly')}>{e.key}:</span>
                    )}
                    <Input
                        value={e.value}
                        onChange={(ev) => updateEntry(idx, 'value', ev.target.value)}
                        placeholder={TR('settings_config_value')}
                        disabled={valDisabled}
                    />
                    {canAddRemove ? (
                        <Button icon="trash" mode="text" onClick={() => removeEntry(idx)} disabled={disabled} tooltip={TR('settings_config_remove')} />
                    ) : (
                        <span style={{ width: 36 }} />
                    )}
                </div>
            ))}
            {canAddRemove && (
                <div className={styles.configRow}>
                    <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder={TR('settings_config_new_key')} disabled={disabled} />
                    <Input value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder={TR('settings_config_new_value')} disabled={disabled} />
                    <Button icon="add" size="s" onClick={addEntry} disabled={disabled || !newKey.trim()} tooltip={TR('settings_config_add')} />
                </div>
            )}
        </div>
    )
}
