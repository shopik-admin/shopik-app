import Checkbox from 'common/components/Checkbox'
import Button from 'common/components/Button'
import render from 'common/functions/render'
import apiReq from 'common/functions/apiReq'
import { useState, useEffect } from 'react'
import styles from './settings.module.css'

export default function Setting({ setting, onUpdate, onEditFull }) {
    const { id, key, value: initialValue, renderType, formType } = setting
    const [isEditing, setIsEditing] = useState(false)
    const [value, setValue] = useState(initialValue ?? '')
    const [editValue, setEditValue] = useState(initialValue ?? '')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)

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

    function handleKeyDown(e) {
        if (e.key === 'Enter' && formType !== 'textarea') {
            e.preventDefault()
            handleSave()
        } else if (e.key === 'Escape') {
            setEditValue(value)
            setIsEditing(false)
        }
    }

    // Direct toggle handler for boolean / switch / checkbox form types
    function handleToggleChange(e) {
        const newVal = e.target.checked ? 'true' : 'false'
        setEditValue(newVal)
        handleSave(newVal)
    }

    const isToggleType = formType === 'checkbox' || formType === 'switch' || renderType === 'boolean' || renderType === 'v-boolean'

    return (
        <div className={styles.settingItem}>
            <div className={styles.settingMain}>
                <div className={styles.settingInfo}>
                    <div className={styles.settingKeyRow}>
                        <span className={styles.settingKey}>{key}</span>
                        {onEditFull && (
                            <Button
                                className={styles.gearBtn}
                                onClick={() => onEditFull(setting)}
                                title="Edit all fields"
                                icon='edit'
                            />
                        )}
                    </div>
                    {error && <span className={styles.settingError}>{error}</span>}
                </div>

                <div className={styles.settingControl}>
                    {isToggleType ? (
                        <Checkbox
                            switchMode={formType === 'switch' || renderType === 'v-boolean'}
                            checked={value === 'true' || value === true || value === '1'}
                            onChange={handleToggleChange}
                            disabled={saving}
                        />
                    ) : isEditing ? (
                        <div className={styles.inlineEditor}>
                            {renderFormInput({
                                formType,
                                editValue,
                                setEditValue,
                                handleKeyDown,
                                handleSave,
                                saving
                            })}
                            <button
                                type="button"
                                className={styles.saveBtn}
                                onClick={() => handleSave()}
                                disabled={saving}
                            >
                                {saving ? '...' : '✓'}
                            </button>
                            <button
                                type="button"
                                className={styles.cancelBtn}
                                onClick={() => {
                                    setEditValue(value)
                                    setIsEditing(false)
                                }}
                                disabled={saving}
                            >
                                ✕
                            </button>
                        </div>
                    ) : (
                        <div
                            className={styles.settingValueContainer}
                            onClick={() => formType !== 'info' && setIsEditing(true)}
                            title={formType !== 'info' ? 'Click to edit' : undefined}
                        >
                            <span className={styles.settingValue}>
                                {renderValueContent(value, renderType)}
                            </span>
                            {formType !== 'info' && (
                                <Button icon='edit' mode='text' />
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function renderValueContent(val, renderType) {

    if (val === undefined || val === null || val === '') {
        return <em className={styles.emptyValue}>Not set</em>
    }

    switch (renderType) {
        case 'color':
        case 'color-boolean':
            return (
                <span className={styles.colorBadge}>
                    <span className={styles.colorSwatch} style={{ backgroundColor: val }} />
                    {val}
                </span>
            )
        default:
            return render({ type: renderType, value: val })
    }
}

function renderFormInput({ formType, editValue, setEditValue, handleKeyDown, handleSave, saving }) {
    switch (formType) {
        case 'textarea':
        case 'css':
            return (
                <textarea
                    className={styles.inlineTextarea}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={saving}
                    autoFocus
                />
            )

        case 'color':
            return (
                <input
                    type="color"
                    className={styles.inlineColorInput}
                    value={editValue || '#000000'}
                    onChange={(e) => setEditValue(e.target.value)}
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
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={saving}
                    autoFocus
                />
            )
    }
}
