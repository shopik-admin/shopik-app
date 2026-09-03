import Checkbox from 'common/components/Checkbox'
import Button from 'common/components/Button'
import ConfirmButton from 'common/components/ConfirmButton'
import render from 'common/functions/render'
import apiReq from 'common/functions/apiReq'
import { useState, useEffect, useRef } from 'react'
import styles from './settings.module.css'
import ConfigEditor from './ConfigEditor.jsx'

export default function Setting({ setting, onUpdate, onEditFull, onDelete }) {
    const { id, key, value: initialValue, renderType, formType, category, public: isPublic } = setting
    const [isEditing, setIsEditing] = useState(false)
    const [value, setValue] = useState(initialValue ?? '')
    const [editValue, setEditValue] = useState(initialValue ?? '')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const [copied, setCopied] = useState(false)
    const lightRef = useRef(null)
    const darkRef = useRef(null)

    useEffect(() => {
        setValue(initialValue ?? '')
        setEditValue(initialValue ?? '')
    }, [initialValue])

    async function handleSave(newValue) {
        const valToSave = newValue !== undefined ? newValue : editValue
        setSaving(true)
        setError(null)
        try {
            const updated = await apiReq('setting/update', { id, value: valToSave })
            const finalVal = updated?.value ?? valToSave
            setValue(finalVal)
            setEditValue(finalVal)
            setIsEditing(false)
            onUpdate?.(updated || { ...setting, value: finalVal })
        } catch (err) {
            setError(err?.message || 'Failed to save setting')
        } finally {
            setSaving(false)
        }
    }

    function handleCancel() {
        setEditValue(value)
        setIsEditing(false)
        setError(null)
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && formType !== 'textarea') {
            e.preventDefault()
            handleSave()
        } else if (e.key === 'Escape') {
            handleCancel()
        }
    }

    function handleToggleChange(e) {
        const newVal = e.target.checked ? 'true' : 'false'
        setEditValue(newVal)
        handleSave(newVal)
    }

    const isToggleType = formType === 'checkbox' || formType === 'switch' || renderType === 'boolean' || renderType === 'v-boolean'
    const isConfig = formType === 'config' || renderType === 'config'
    const isColor = formType === 'color' || renderType === 'color' || renderType === 'color-boolean'
    const isThemeColor = category === 'theme' && isColor

    async function handleCopy(e) {
        if (e) e.stopPropagation()
        try {
            await navigator.clipboard.writeText(`var(--${key})`)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
        } catch { }
    }

    function normalizeColor(val) {
        if (val && typeof val === 'object' && !Array.isArray(val) && ('light' in val || 'dark' in val)) return { light: val.light || '#000000', dark: val.dark || '#ffffff' }
        if (typeof val === 'string' && val) return { light: val, dark: val }
        return { light: '#000000', dark: '#ffffff' }
    }

    async function handleDelete() {
        setSaving(true)
        setError(null)
        try {
            await apiReq('setting/delete', { id })
            onDelete?.(id)
        } catch (err) {
            setError(err?.message || 'Failed to delete setting')
        } finally {
            setSaving(false)
        }
    }

    async function handlePublicToggle(e) {
        const newVal = e.target.checked
        setSaving(true)
        setError(null)
        try {
            const updated = await apiReq('setting/update', { id, public: newVal })
            onUpdate?.(updated || { ...setting, public: newVal })
        } catch (err) {
            setError(err?.message || 'Failed to update public flag')
        } finally {
            setSaving(false)
        }
    }

    if (isToggleType) {
        return (
            <div className={styles.settingItem}>
                <div className={styles.settingMain}>
                    <div className={styles.settingInfo}>
                        <div className={styles.settingKeyRow}>
                            {onEditFull && <Button className={styles.gearBtn} onClick={() => onEditFull(setting)} title="Edit all fields" icon='edit' />}
                            {onDelete && <ConfirmButton q={`Delete "${key}"?`} onOk={handleDelete} icon="trash" className={styles.deleteBtn} title="Delete setting" disabled={saving} />}
                            <span className={styles.settingKey}>{key}</span>
                            <label title={isPublic ? 'Public — sent to client' : 'Private — not sent to client'} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: isPublic ? 'var(--text-success-primary)' : 'var(--text-tertiary)', cursor: saving ? 'wait' : 'pointer', marginInlineStart: '0.5rem' }}>
                                <input type="checkbox" checked={!!isPublic} onChange={handlePublicToggle} disabled={saving} style={{ accentColor: 'var(--bg-brand-primary)' }} />
                                public
                            </label>
                        </div>
                        {error && <span className={styles.settingError}>{error}</span>}
                    </div>
                    <div className={styles.settingControl}>
                        <Checkbox
                            switchMode={formType === 'switch' || renderType === 'v-boolean'}
                            checked={value === 'true' || value === true || value === '1'}
                            onChange={handleToggleChange}
                            disabled={saving}
                        />
                    </div>
                </div>
            </div>
        )
    }

    if (isConfig) {
        return (
            <div className={styles.settingItem}>
                <div className={styles.settingMain}>
                    <div className={styles.settingInfo}>
                        <div className={styles.settingKeyRow}>
                            {onEditFull && <Button className={styles.gearBtn} onClick={() => onEditFull(setting)} title="Edit all fields" icon='edit' />}
                            {onDelete && <ConfirmButton q={`Delete "${key}"?`} onOk={handleDelete} icon="trash" className={styles.deleteBtn} title="Delete setting" disabled={saving} />}
                            <span className={styles.settingKey}>{key}</span>
                            <label title={isPublic ? 'Public — sent to client' : 'Private — not sent to client'} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: isPublic ? 'var(--text-success-primary)' : 'var(--text-tertiary)', cursor: saving ? 'wait' : 'pointer', marginInlineStart: '0.5rem' }}>
                                <input type="checkbox" checked={!!isPublic} onChange={handlePublicToggle} disabled={saving} style={{ accentColor: 'var(--bg-brand-primary)' }} />
                                public
                            </label>
                        </div>
                        {error && <span className={styles.settingError}>{error}</span>}
                    </div>
                    <div className={styles.settingControl}>
                        {isEditing ? (
                            <div className={styles.inlineEditor} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                                <ConfigEditor
                                    value={editValue && typeof editValue === 'object' && !Array.isArray(editValue) ? editValue : {}}
                                    onChange={(next) => setEditValue(next)}
                                    disabled={saving}
                                />
                                <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                                    <Button icon="check" className={styles.saveBtn} onClick={() => handleSave()} disabled={saving} />
                                    <Button icon="x" className={styles.cancelBtn} onClick={handleCancel} disabled={saving} />
                                </div>
                            </div>
                        ) : (
                            <div className={styles.settingValueContainer} onClick={() => setIsEditing(true)} title="Click to edit">
                                <span className={styles.settingValue}>{renderValueContent(value, renderType, formType, false)}</span>
                                <Button icon='edit' mode='text' />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    if (isColor) {
        const displayVal = isEditing ? editValue : value
        const { light, dark } = normalizeColor(displayVal)
        const hasDual = displayVal && typeof displayVal === 'object' && !Array.isArray(displayVal) && ('light' in displayVal || 'dark' in displayVal)

        return (
            <div className={styles.settingItem}>
                <div className={styles.settingMain}>
                    <div className={styles.settingInfo}>
                        <div className={styles.settingKeyRow}>
                            {onEditFull && <Button className={styles.gearBtn} onClick={() => onEditFull(setting)} title="Edit all fields" icon='edit' />}
                            {onDelete && <ConfirmButton q={`Delete "${key}"?`} onOk={handleDelete} icon="trash" className={styles.deleteBtn} title="Delete setting" disabled={saving} />}
                            <span className={styles.settingKey}>{key}</span>
                            <label title={isPublic ? 'Public — sent to client' : 'Private — not sent to client'} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: isPublic ? 'var(--text-success-primary)' : 'var(--text-tertiary)', cursor: saving ? 'wait' : 'pointer', marginInlineStart: '0.5rem' }}>
                                <input type="checkbox" checked={!!isPublic} onChange={handlePublicToggle} disabled={saving} style={{ accentColor: 'var(--bg-brand-primary)' }} />
                                public
                            </label>
                            {isThemeColor && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginInlineStart: '0.25rem' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>var(--{key})</span>
                                    <Button icon={copied ? "check" : "copy"} mode="text" onClick={handleCopy} tooltip={copied ? "Copied!" : "Copy var(--" + key + ")"} style={{ padding: '0 2px' }} />
                                </span>
                            )}
                        </div>
                        {error && <span className={styles.settingError}>{error}</span>}
                    </div>
                    <div className={styles.settingControl} style={{ gap: '0.5rem' }}>
                        <div
                            className={styles.settingValueContainer}
                            onClick={() => { if (!isEditing && formType !== 'info') setIsEditing(true) }}
                            title={!isEditing && formType !== 'info' ? 'Click to edit' : undefined}
                            style={{ cursor: !isEditing && formType !== 'info' ? 'pointer' : 'default', flex: 1, minWidth: 0 }}
                        >
                            <span className={styles.settingValue} style={{ flex: 1, minWidth: 0 }}>
                                {hasDual ? (
                                    <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span className={styles.colorBadge} style={{ gap: '0.35rem' }}>
                                            Dark: {dark}
                                            <span
                                                className={styles.colorSwatch}
                                                style={{ backgroundColor: dark, cursor: isEditing ? 'pointer' : 'default', border: isEditing ? '1px solid var(--border-brand)' : undefined }}
                                                onClick={(e) => {
                                                    if (!isEditing) return
                                                    e.stopPropagation()
                                                    darkRef.current?.click()
                                                }}
                                                title={isEditing ? 'Click to pick dark color' : undefined}
                                            />
                                        </span>
                                        <span className={styles.colorBadge} style={{ gap: '0.35rem' }}>
                                            Light: {light}
                                            <span
                                                className={styles.colorSwatch}
                                                style={{ backgroundColor: light, cursor: isEditing ? 'pointer' : 'default', border: isEditing ? '1px solid var(--border-brand)' : undefined }}
                                                onClick={(e) => {
                                                    if (!isEditing) return
                                                    e.stopPropagation()
                                                    lightRef.current?.click()
                                                }}
                                                title={isEditing ? 'Click to pick light color' : undefined}
                                            />
                                        </span>
                                    </span>
                                ) : (
                                    <span className={styles.colorBadge}>
                                        <span
                                            className={styles.colorSwatch}
                                            style={{ backgroundColor: displayVal || '#000000', cursor: isEditing ? 'pointer' : 'default' }}
                                            onClick={(e) => {
                                                if (!isEditing) return
                                                e.stopPropagation()
                                                lightRef.current?.click()
                                            }}
                                            title={isEditing ? 'Click to pick color' : undefined}
                                        />
                                        {displayVal || <em className={styles.emptyValue}>Not set</em>}
                                    </span>
                                )}
                            </span>
                        </div>
                        {isEditing ? (
                            <span style={{ display: 'inline-flex', gap: '0.35rem', flexShrink: 0 }}>
                                <Button icon="check" className={styles.saveBtn} onClick={() => handleSave()} disabled={saving} stopPropagation />
                                <Button icon="x" className={styles.cancelBtn} onClick={handleCancel} disabled={saving} stopPropagation />
                            </span>
                        ) : (
                            formType !== 'info' && <Button icon='edit' mode='text' onClick={() => setIsEditing(true)} />
                        )}
                        {/* hidden pickers */}
                        <input
                            ref={lightRef}
                            type="color"
                            value={light}
                            onChange={(e) => setEditValue(prev => {
                                const cur = normalizeColor(prev ?? editValue)
                                return { ...cur, light: e.target.value }
                            })}
                            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                            tabIndex={-1}
                        />
                        <input
                            ref={darkRef}
                            type="color"
                            value={dark}
                            onChange={(e) => setEditValue(prev => {
                                const cur = normalizeColor(prev ?? editValue)
                                return { ...cur, dark: e.target.value }
                            })}
                            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                            tabIndex={-1}
                        />
                    </div>
                </div>
            </div>
        )
    }

    // Default (text, textarea, date, etc) - keep same container look, only icons differ
    return (
        <div className={styles.settingItem}>
            <div className={styles.settingMain}>
                <div className={styles.settingInfo}>
                    <div className={styles.settingKeyRow}>
                        {onEditFull && <Button className={styles.gearBtn} onClick={() => onEditFull(setting)} title="Edit all fields" icon='edit' />}
                        {onDelete && <ConfirmButton q={`Delete "${key}"?`} onOk={handleDelete} icon="trash" className={styles.deleteBtn} title="Delete setting" disabled={saving} />}
                        <span className={styles.settingKey}>{key}</span>
                        <label title={isPublic ? 'Public — sent to client' : 'Private — not sent to client'} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: isPublic ? 'var(--text-success-primary)' : 'var(--text-tertiary)', cursor: saving ? 'wait' : 'pointer', marginInlineStart: '0.5rem' }}>
                            <input type="checkbox" checked={!!isPublic} onChange={handlePublicToggle} disabled={saving} style={{ accentColor: 'var(--bg-brand-primary)' }} />
                            public
                        </label>
                    </div>
                    {error && <span className={styles.settingError}>{error}</span>}
                </div>
                <div className={styles.settingControl} style={{ gap: '0.5rem' }}>
                    {isEditing ? (
                        <>
                            <div className={styles.settingValueContainer} style={{ cursor: 'default', flex: 1, minWidth: 0 }}>
                                <span className={styles.settingValue} style={{ flex: 1, minWidth: 0 }}>
                                    {renderFormInput({ formType, editValue, setEditValue, handleKeyDown, handleSave, saving })}
                                </span>
                            </div>
                            <span style={{ display: 'inline-flex', gap: '0.35rem', flexShrink: 0 }}>
                                <Button icon="check" className={styles.saveBtn} onClick={() => handleSave()} disabled={saving} stopPropagation />
                                <Button icon="x" className={styles.cancelBtn} onClick={handleCancel} disabled={saving} stopPropagation />
                            </span>
                        </>
                    ) : (
                        <>
                            <div
                                className={styles.settingValueContainer}
                                onClick={() => formType !== 'info' && setIsEditing(true)}
                                title={formType !== 'info' ? 'Click to edit' : undefined}
                                style={{ flex: 1, minWidth: 0 }}
                            >
                                <span className={styles.settingValue} style={{ flex: 1, minWidth: 0 }}>{renderValueContent(value, renderType, formType)}</span>
                            </div>
                            {formType !== 'info' && <Button icon='edit' mode='text' onClick={() => setIsEditing(true)} />}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

function renderValueContent(val, renderType, formType, isEditing) {
    if (val === undefined || val === null || val === '') {
        return <em className={styles.emptyValue}>Not set</em>
    }
    const isConfig = formType === 'config' || renderType === 'config'
    if (isConfig) {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            const entries = Object.entries(val)
            if (entries.length === 0) return <em className={styles.emptyValue}>Empty config</em>
            return (
                <span className={styles.pillList}>
                    {entries.map(([k, v]) => (
                        <span key={k} className={styles.pill}>{k}: {String(v).slice(0, 40)}</span>
                    ))}
                </span>
            )
        }
        return render({ type: renderType, value: val })
    }
    const isColor = formType === 'color' || renderType === 'color' || renderType === 'color-boolean'
    if (isColor) {
        if (val && typeof val === 'object' && !Array.isArray(val) && ('light' in val || 'dark' in val)) {
            const light = val.light || '#000000'
            const dark = val.dark || '#ffffff'
            return (
                <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span className={styles.colorBadge}>Light: {light}<span className={styles.colorSwatch} style={{ backgroundColor: light }} /></span>
                    <span className={styles.colorBadge}>Dark: {dark}<span className={styles.colorSwatch} style={{ backgroundColor: dark }} /></span>
                </span>
            )
        }
        return (
            <span className={styles.colorBadge}>
                <span className={styles.colorSwatch} style={{ backgroundColor: val }} />
                {val}
            </span>
        )
    }
    return render({ type: renderType, value: val })
}

function renderFormInput({ formType, editValue, setEditValue, handleKeyDown, handleSave, saving }) {
    switch (formType) {
        case 'textarea':
        case 'css':
            return (
                <textarea
                    className={styles.inlineTextarea}
                    value={typeof editValue === 'object' ? JSON.stringify(editValue) : editValue ?? ''}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={saving}
                    autoFocus
                />
            )
        case 'date':
            return (
                <input
                    type="date"
                    className={styles.inlineInput}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={saving}
                    autoFocus
                />
            )
        case 'text':
        case 'file':
        case 'image':
        case 'link':
        case 'select':
        default:
            return (
                <input
                    type="text"
                    className={styles.inlineInput}
                    value={typeof editValue === 'object' ? JSON.stringify(editValue) : editValue ?? ''}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={saving}
                    autoFocus
                />
            )
    }
}
