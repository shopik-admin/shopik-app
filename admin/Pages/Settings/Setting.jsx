import Checkbox from 'common/components/Checkbox'
import Button from 'common/components/Button'
import Icon from 'common/components/Icon'
import render from 'common/functions/render'
import apiReq from 'common/functions/apiReq'
import { getSettingFileUrl, getSettingFileSize } from 'common/functions/settingFileUrl'
import { useState, useEffect, useRef } from 'react'
import { useText } from 'common/texts/TextProvider'
import { useUser } from 'features/User'
import SettingRow from './SettingRow.jsx'
import ConfigEditor from './ConfigEditor.jsx'
import styles from './settings.module.css'

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,.svg,.ico'
// Settings declaring custom `sizes` render every variant through sharp,
// so they only accept raster uploads (svg/ico cannot be resized to variants).
const RASTER_ACCEPT = 'image/png,image/jpeg,image/webp'

export default function Setting({ setting, onUpdate, onEditFull, onDelete }) {
    const { id, key, value: initialValue, renderType, formType, category, public: isPublic } = setting
    const { TR } = useText()
    const [isEditing, setIsEditing] = useState(false)
    const [value, setValue] = useState(initialValue ?? '')
    const [editValue, setEditValue] = useState(initialValue ?? '')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState(null)
    const [expanded, setExpanded] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [copiedVar, setCopiedVar] = useState(false)
    const fileInputRef = useRef(null)
    const savedTimer = useRef(null)
    const { isSuperAdmin, role: adminRole } = useUser() || {}
    const canEditValues = isSuperAdmin || adminRole?.permissions?.includes('setting:update')
    const canEditKeys = !!isSuperAdmin

    useEffect(() => {
        setValue(initialValue ?? '')
        setEditValue(initialValue ?? '')
    }, [initialValue])

    useEffect(() => () => clearTimeout(savedTimer.current), [])

    function markSaved() {
        setSaved(true)
        clearTimeout(savedTimer.current)
        savedTimer.current = setTimeout(() => setSaved(false), 1800)
    }

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
            markSaved()
            onUpdate?.(updated || { ...setting, value: finalVal })
        } catch (err) {
            setError(err?.message || TR('settings_save_failed'))
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

    async function handleCopyVar(e) {
        if (e) e.stopPropagation()
        try {
            await navigator.clipboard.writeText(`var(--${key})`)
            setCopiedVar(true)
            setTimeout(() => setCopiedVar(false), 1500)
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
            setError(err?.message || TR('settings_delete_failed'))
            setSaving(false)
        }
    }

    async function handlePublicToggle() {
        const newVal = !isPublic
        setSaving(true)
        setError(null)
        try {
            const updated = await apiReq('setting/update', { id, public: newVal })
            markSaved()
            onUpdate?.(updated || { ...setting, public: newVal })
        } catch (err) {
            setError(err?.message || TR('settings_public_failed'))
        } finally {
            setSaving(false)
        }
    }

    const rowActions = {
        setting,
        busy: saving || uploading,
        error,
        saved,
        onEditFull,
        onDelete: onDelete ? handleDelete : undefined,
        onTogglePublic: canEditValues ? handlePublicToggle : undefined
    }

    if (isToggleType) {
        return <SettingRow {...rowActions}>
            <Checkbox
                switchMode={formType === 'switch' || renderType === 'v-boolean'}
                checked={value === 'true' || value === true || value === '1'}
                onChange={handleToggleChange}
                disabled={saving}
            />
        </SettingRow>
    }

    if (isConfig) {
        const configObj = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
        const editObj = editValue && typeof editValue === 'object' && !Array.isArray(editValue) ? editValue : {}
        const configCount = Object.keys(configObj).length
        const isDirty = JSON.stringify(editObj) !== JSON.stringify(configObj)

        function toggleExpand() {
            const next = !expanded
            if (next) setEditValue(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
            setExpanded(next)
        }
        function handleConfigCancel() {
            setEditValue(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
            setError(null)
        }

        return <SettingRow
            {...rowActions}
            expanded={expanded}
            footer={<>
                <ConfigEditor
                    value={editObj}
                    onChange={(next) => setEditValue(next)}
                    disabled={saving || !canEditValues}
                    canEditKeys={canEditKeys}
                    canEditValues={canEditValues}
                />
                {canEditValues ? (
                    <div className={styles.panelActions}>
                        <Button
                            icon="x"
                            className={styles.cancelBtn}
                            onClick={handleConfigCancel}
                            disabled={saving || !isDirty}
                            tooltip={TR('settings_revert')}
                        />
                        <Button
                            icon="check"
                            className={styles.saveBtn}
                            onClick={() => handleSave(editObj)}
                            disabled={saving || !isDirty}
                            tooltip={TR('save')}
                        />
                    </div>
                ) : (
                    <p className={styles.panelNote}>{TR('settings_config_readonly')}</p>
                )}
            </>}
        >
            <div className={styles.configSummary}>
                <span className={styles.configCount}>{TR('settings_config_keys', { count: configCount })}</span>
                {!canEditKeys && <span className={styles.configNote}>{TR('settings_config_keys_readonly')}</span>}
            </div>
            <Button
                className={styles.expandBtn}
                icon={expanded ? 'down' : 'left'}
                mode="text"
                onClick={toggleExpand}
                tooltip={expanded ? TR('settings_collapse') : TR('settings_expand')}
                aria-expanded={expanded}
            />
        </SettingRow>
    }

    if (isColor) {
        const displayVal = isEditing ? editValue : value
        const { light, dark } = normalizeColor(displayVal)
        const hasDual = displayVal && typeof displayVal === 'object' && !Array.isArray(displayVal) && ('light' in displayVal || 'dark' in displayVal)

        return <SettingRow {...rowActions}>
            {isEditing ? (
                <div className={styles.colorEditor}>
                    <label className={styles.colorField}>
                        <span className={styles.colorFieldLabel}>{TR('settings_color_light')}</span>
                        <span className={styles.colorFieldRow}>
                            <input
                                type="color"
                                className={styles.colorInput}
                                value={light}
                                onChange={(e) => setEditValue((prev) => ({ ...normalizeColor(prev ?? editValue), light: e.target.value }))}
                            />
                            <code className={styles.colorHex}>{light}</code>
                        </span>
                    </label>
                    <label className={styles.colorField}>
                        <span className={styles.colorFieldLabel}>{TR('settings_color_dark')}</span>
                        <span className={styles.colorFieldRow}>
                            <input
                                type="color"
                                className={styles.colorInput}
                                value={dark}
                                onChange={(e) => setEditValue((prev) => ({ ...normalizeColor(prev ?? editValue), dark: e.target.value }))}
                            />
                            <code className={styles.colorHex}>{dark}</code>
                        </span>
                    </label>
                    <div className={styles.controlActions}>
                        <Button icon="check" className={styles.saveBtn} onClick={() => handleSave()} disabled={saving} tooltip={TR('save')} />
                        <Button icon="x" className={styles.cancelBtn} onClick={handleCancel} disabled={saving} tooltip={TR('cancel')} />
                    </div>
                </div>
            ) : (
                <div className={styles.colorValue}>
                    <span className={styles.colorSwatches}>
                        {hasDual ? (
                            <>
                                <span className={styles.colorSwatch} style={{ backgroundColor: light }} title={`${TR('settings_color_light')}: ${light}`} />
                                <span className={styles.colorSwatch} style={{ backgroundColor: dark }} title={`${TR('settings_color_dark')}: ${dark}`} />
                            </>
                        ) : (
                            <span className={styles.colorSwatch} style={{ backgroundColor: displayVal || '#000000' }} title={displayVal || ''} />
                        )}
                    </span>
                    <code className={styles.colorCodes}>
                        {hasDual ? `${light} · ${dark}` : (displayVal || TR('settings_not_set'))}
                    </code>
                    {isThemeColor && (
                        <span className={styles.varChip}>
                            <code>var(--{key})</code>
                            <Button
                                icon={copiedVar ? 'check' : 'copy'}
                                mode="text"
                                onClick={handleCopyVar}
                                tooltip={copiedVar ? TR('settings_copied') : TR('settings_copy_var', { key })}
                            />
                        </span>
                    )}
                    {formType !== 'info' && (
                        <Button icon="edit" mode="text" onClick={() => setIsEditing(true)} tooltip={TR('edit')} />
                    )}
                </div>
            )}
        </SettingRow>
    }

    const isFileType = formType === 'file' || formType === 'image' || renderType === 'image'
    const isImageType = formType === 'image' || renderType === 'image'
    const hasSizes = !!setting.sizes
    const imageAccept = hasSizes ? RASTER_ACCEPT : IMAGE_ACCEPT

    async function handleFileSelect(e) {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        setError(null)
        if (isImageType && hasSizes && !/^image\/(png|jpe?g|webp)$/i.test(file.type || '')) {
            setError(TR('settings_upload_raster_only'))
            return
        }
        if (isImageType && !hasSizes && !/^(image\/|.*\.(svg|ico)$)/i.test(`${file.type} ${file.name}`)) {
            setError(TR('settings_upload_image_only'))
            return
        }
        if (!isImageType && !/^(application\/pdf|.*\.pdf)$/i.test(`${file.type} ${file.name}`)) {
            setError(TR('settings_upload_pdf_only'))
            return
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            setError(TR('settings_upload_too_large'))
            return
        }
        const reader = new FileReader()
        reader.onload = async () => {
            const dataUrl = String(reader.result || '')
            const fileBase64 = dataUrl.includes(',') ? dataUrl.split(',').pop() : dataUrl
            setUploading(true)
            try {
                const res = await apiReq('setting/upload_file', { id, fileBase64, filename: file.name, contentType: file.type })
                const next = res?.basePath || res?.setting?.value
                if (!next) throw new Error(TR('settings_upload_failed'))
                await handleSave(next)
            } catch (err) {
                setError(err?.message || TR('settings_upload_failed'))
            } finally {
                setUploading(false)
            }
        }
        reader.readAsDataURL(file)
    }

    // File / image settings — upload to storage, value is the relative path
    if (isFileType) {
        const fileUrl = getSettingFileUrl(value, getSettingFileSize(setting))
        return <SettingRow {...rowActions}>
            <div className={styles.fileValue}>
                {isImageType ? (
                    fileUrl
                        ? <img src={fileUrl} alt={key} title={typeof value === 'string' ? value : ''} className={styles.settingThumb} />
                        : <span className={styles.emptyValue}>{TR('settings_not_set')}</span>
                ) : (
                    <>
                        <code className={styles.fileName}>{value ? String(value) : TR('settings_not_set')}</code>
                        {fileUrl && (
                            <a href={fileUrl} target="_blank" rel="noreferrer" className={styles.linkValue}>
                                {TR('settings_open_pdf')}
                            </a>
                        )}
                    </>
                )}
                {canEditValues && (
                    <>
                        <Button
                            icon="upload"
                            mode="text"
                            disabled={uploading || saving}
                            loading={uploading}
                            onClick={() => fileInputRef.current?.click()}
                            tooltip={isImageType ? TR('settings_upload_image') : TR('settings_upload_pdf')}
                        />
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={isImageType ? imageAccept : 'application/pdf,.pdf'}
                            onChange={handleFileSelect}
                            disabled={uploading || saving}
                            style={{ display: 'none' }}
                        />
                    </>
                )}
            </div>
        </SettingRow>
    }

    // Default (text, textarea, date, info…) — same shell, control differs
    return <SettingRow {...rowActions}>
        {isEditing ? (
            <div className={styles.inlineEditor}>
                {renderFormInput({ formType, editValue, setEditValue, handleKeyDown, saving })}
                <div className={styles.controlActions}>
                    <Button icon="check" className={styles.saveBtn} onClick={() => handleSave()} disabled={saving} tooltip={TR('save')} />
                    <Button icon="x" className={styles.cancelBtn} onClick={handleCancel} disabled={saving} tooltip={TR('cancel')} />
                </div>
            </div>
        ) : (
            <div className={styles.textValue}>
                <button
                    type="button"
                    className={styles.valueButton}
                    onClick={() => formType !== 'info' && setIsEditing(true)}
                    disabled={formType === 'info'}
                    title={formType !== 'info' ? TR('settings_click_to_edit') : undefined}
                >
                    <span className={styles.valueText}>{renderValueContent(value, renderType, formType, setting, TR)}</span>
                    {formType !== 'info' && <Icon name="edit" className={styles.valueEditIcon} />}
                </button>
            </div>
        )}
    </SettingRow>
}

function renderValueContent(val, renderType, formType, setting, TR = (k) => k) {
    if (val === undefined || val === null || val === '') {
        return <span className={styles.emptyValue}>{TR('settings_not_set')}</span>
    }
    const isConfig = formType === 'config' || renderType === 'config'
    if (isConfig) {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            const entries = Object.entries(val)
            if (entries.length === 0) return <span className={styles.emptyValue}>{TR('settings_empty_config')}</span>
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
                <span className={styles.colorBadge}>
                    <span className={styles.colorSwatch} style={{ backgroundColor: light }} />
                    <span className={styles.colorSwatch} style={{ backgroundColor: dark }} />
                    {light} · {dark}
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
    const isImage = formType === 'image' || renderType === 'image'
    if (isImage) {
        const url = getSettingFileUrl(val, getSettingFileSize(setting))
        if (!url) return <span className={styles.emptyValue}>{TR('settings_not_set')}</span>
        return <img src={url} alt="" className={styles.settingThumb} />
    }
    if (formType === 'file') {
        const url = getSettingFileUrl(val, getSettingFileSize(setting))
        if (!url) return <span className={styles.emptyValue}>{TR('settings_not_set')}</span>
        return <a href={url} target="_blank" rel="noreferrer" className={styles.linkValue}>{TR('settings_open_pdf')}</a>
    }
    return render({ type: renderType, value: val })
}

function renderFormInput({ formType, editValue, setEditValue, handleKeyDown, saving }) {
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
