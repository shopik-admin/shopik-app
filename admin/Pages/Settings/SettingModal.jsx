import { useState, useRef } from 'react'
import Button from 'common/components/Button'
import Checkbox from 'common/components/Checkbox'
import Icon from 'common/components/Icon'
import Input from 'common/components/Input'
import Select from 'common/components/Select'
import { useText } from 'common/texts/TextProvider'
import { useUser } from 'features/User'
import apiReq from 'common/functions/apiReq'
import { getSettingFileUrl, getSettingFileSize } from 'common/functions/settingFileUrl'
import ConfigEditor from './ConfigEditor.jsx'
import styles from './settings.module.css'

const FORM_TYPES = [
    'text', 'checkbox', 'switch', 'color', 'select',
    'file', 'image', 'textarea', 'date', 'info', 'link', 'css', 'config'
]

const RENDER_TYPES = [
    'string', 'tr', 'image', 'color', 'list', 'field', 'name', 'id',
    'address', 'date', 'time', 'datetime', 'boolean', 'v-boolean',
    'color-boolean', 'nis', 'coin', 'mr', 'config'
]

function Field({ label, hint, children, className = '' }) {
    return <div className={`${styles.field} ${className}`}>
        <span className={styles.fieldLabel}>{label}</span>
        {children}
        {hint && <span className={styles.fieldHint}>{hint}</span>}
    </div>
}

function normalizeColorValue(val) {
    if (val && typeof val === 'object' && ('light' in val || 'dark' in val)) return val
    if (typeof val === 'string' && val) return { light: val, dark: val }
    return { light: '#000000', dark: '#ffffff' }
}

/**
 * Create / edit a setting. The value control comes first (what the admin came
 * to change), placement second, and the technical fields sit behind
 * "אפשרויות מתקדמות" so they do not get in the way of day-to-day edits.
 */
export default function SettingModal({
    setting,
    defaultCategory,
    defaultSubCategory,
    defaultDomainId,
    defaultFormType,
    defaultRenderType,
    onSuccess,
    onClose
}) {
    const { TR } = useText()
    const isEdit = !!setting
    const { isSuperAdmin: modalIsSuperAdmin, role } = useUser() || {}
    const initialIsConfig = setting?.formType === 'config' || setting?.renderType === 'config' || defaultFormType === 'config' || defaultRenderType === 'config'
    const [formData, setFormData] = useState({
        key: setting?.key || '',
        value: setting?.value !== undefined ? setting.value : (initialIsConfig ? {} : ''),
        category: setting?.category || defaultCategory || 'General',
        subCategory: setting?.subCategory || defaultSubCategory || 'General',
        domainId: setting?.domainId || defaultDomainId || '',
        formType: setting?.formType || defaultFormType || 'text',
        renderType: setting?.renderType || defaultRenderType || 'string',
        public: setting?.public ?? false
    })
    const [error, setError] = useState(null)
    const [loading, setLoading] = useState(false)
    const [pendingFile, setPendingFile] = useState(null)
    const [modalUploading, setModalUploading] = useState(false)
    const [advancedOpen, setAdvancedOpen] = useState(false)
    const modalFileRef = useRef(null)

    const isModalFileType = formData.formType === 'file' || formData.formType === 'image' || formData.renderType === 'image'
    const isModalImage = formData.formType === 'image' || formData.renderType === 'image'
    // Settings with custom `sizes` render variants through sharp → raster only.
    const hasModalSizes = !!setting?.sizes
    const modalImageAccept = hasModalSizes ? 'image/png,image/jpeg,image/webp' : 'image/png,image/jpeg,image/webp,.svg,.ico'

    function handleModalFile(e) {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        setError(null)
        if (isModalImage && hasModalSizes && !/^image\/(png|jpe?g|webp)$/i.test(file.type || '')) {
            setError(TR('settings_upload_raster_only'))
            return
        }
        if (isModalImage && !hasModalSizes && !/^(image\/|.*\.(svg|ico)$)/i.test(`${file.type} ${file.name}`)) {
            setError(TR('settings_upload_image_only'))
            return
        }
        if (!isModalImage && !/^(application\/pdf|.*\.pdf)$/i.test(`${file.type} ${file.name}`)) {
            setError(TR('settings_upload_pdf_only'))
            return
        }
        if (file.size > 8 * 1024 * 1024) {
            setError(TR('settings_upload_too_large'))
            return
        }
        const reader = new FileReader()
        reader.onload = async () => {
            const dataUrl = String(reader.result || '')
            const fileBase64 = dataUrl.includes(',') ? dataUrl.split(',').pop() : dataUrl
            if (isEdit) {
                setModalUploading(true)
                try {
                    const res = await apiReq('setting/upload_file', { id: setting.id, fileBase64, filename: file.name, contentType: file.type })
                    const next = res?.basePath || res?.setting?.value
                    if (!next) throw new Error(TR('settings_upload_failed'))
                    setFormData((prev) => ({ ...prev, value: next }))
                } catch (err) {
                    setError(err?.message || TR('settings_upload_failed'))
                } finally {
                    setModalUploading(false)
                }
            } else {
                setPendingFile({ fileBase64, filename: file.name, contentType: file.type })
            }
        }
        reader.readAsDataURL(file)
    }

    async function handleSubmit(e) {
        e.preventDefault()
        setLoading(true)
        setError(null)
        try {
            let result
            if (isEdit) {
                result = await apiReq('setting/update', { id: setting.id, ...formData })
            } else {
                const toCreate = pendingFile ? { ...formData, value: pendingFile.filename || 'pending upload' } : formData
                result = await apiReq('setting/create', toCreate)
                if (pendingFile && result?.id) {
                    const up = await apiReq('setting/upload_file', { id: result.id, ...pendingFile })
                    result = up?.setting || { ...result, value: up?.basePath }
                }
            }
            onSuccess(result || { ...(setting || {}), ...formData })
            onClose()
        } catch (err) {
            setError(err?.message || TR(isEdit ? 'settings_update_failed' : 'settings_create_failed'))
        } finally {
            setLoading(false)
        }
    }

    const isConfig = formData.formType === 'config' || formData.renderType === 'config'
    const isColor = formData.formType === 'color'
    const canAddConfig = !!modalIsSuperAdmin
    // filter 'config' for users who cannot add configs; keep current value if already config to avoid blank select
    const formTypeOptions = canAddConfig ? FORM_TYPES : FORM_TYPES.filter((t) => t !== 'config' || t === formData.formType)
    const renderTypeOptions = canAddConfig ? RENDER_TYPES : RENDER_TYPES.filter((t) => t !== 'config' || t === formData.renderType)
    const colorValue = normalizeColorValue(formData.value)

    return <form onSubmit={handleSubmit} className={styles.modalForm}>
        <p className={styles.modalIntro}>{TR('settings_modal_hint')}</p>

        <Input
            label={TR('settings_field_key')}
            info={TR('settings_field_key_hint')}
            name="key"
            required
            value={formData.key}
            placeholder="siteName"
            onChange={(e) => setFormData({ ...formData, key: e.target.value })}
            disabled={isEdit && !modalIsSuperAdmin}
            hideErrorMessage
            title={isEdit && !modalIsSuperAdmin ? TR('settings_field_key_locked') : TR('settings_field_key')}
        />

        <section className={styles.modalSection}>
            <h4 className={styles.modalSectionTitle}>{TR('settings_section_value')}</h4>
            <p className={styles.modalSectionHint}>{TR('settings_section_value_hint')}</p>

            {isConfig ? (
                <div>
                    <ConfigEditor
                        value={typeof formData.value === 'object' && formData.value !== null && !Array.isArray(formData.value) ? formData.value : {}}
                        onChange={(next) => setFormData({ ...formData, value: next })}
                        canEditKeys={!!modalIsSuperAdmin}
                        canEditValues={role?.permissions?.includes('setting:update')}
                    />
                    {!modalIsSuperAdmin && <p className={styles.fieldHint}>{TR('settings_config_keys_readonly')}</p>}
                </div>
            ) : isColor ? (
                <div className={styles.colorEditor}>
                    <label className={styles.colorField}>
                        <span className={styles.colorFieldLabel}>{TR('settings_color_light')}</span>
                        <span className={styles.colorFieldRow}>
                            <input
                                type="color"
                                className={styles.colorInput}
                                value={colorValue.light}
                                onChange={(e) => setFormData({ ...formData, value: { ...normalizeColorValue(formData.value), light: e.target.value } })}
                            />
                            <code className={styles.colorHex}>{colorValue.light}</code>
                        </span>
                    </label>
                    <label className={styles.colorField}>
                        <span className={styles.colorFieldLabel}>{TR('settings_color_dark')}</span>
                        <span className={styles.colorFieldRow}>
                            <input
                                type="color"
                                className={styles.colorInput}
                                value={colorValue.dark}
                                onChange={(e) => setFormData({ ...formData, value: { ...normalizeColorValue(formData.value), dark: e.target.value } })}
                            />
                            <code className={styles.colorHex}>{colorValue.dark}</code>
                        </span>
                    </label>
                </div>
            ) : isModalFileType ? (
                <div className={styles.fileField}>
                    <span className={styles.fieldHint}>
                        {isModalImage ? TR('settings_file_hint_image') : TR('settings_file_hint_pdf')}
                    </span>
                    {typeof formData.value === 'string' && formData.value && !pendingFile && (
                        <div className={styles.filePreview}>
                            {isModalImage
                                ? <img src={getSettingFileUrl(formData.value, getSettingFileSize(setting))} alt="" className={styles.settingThumb} />
                                : <a href={getSettingFileUrl(formData.value, getSettingFileSize(setting))} target="_blank" rel="noreferrer" className={styles.linkValue}>{TR('settings_open_pdf')}</a>}
                        </div>
                    )}
                    {pendingFile && <span className={styles.fieldHint}>{TR('settings_file_pending', { name: pendingFile.filename })}</span>}
                    <div className={styles.fileActions}>
                        <Button type="button" icon="upload" disabled={loading || modalUploading} loading={modalUploading} onClick={() => modalFileRef.current?.click()}>
                            {isEdit ? TR('settings_upload_file') : TR('settings_choose_file')}
                        </Button>
                        <input
                            ref={modalFileRef}
                            type="file"
                            accept={isModalImage ? modalImageAccept : 'application/pdf,.pdf'}
                            onChange={handleModalFile}
                            disabled={loading || modalUploading}
                            style={{ display: 'none' }}
                        />
                    </div>
                </div>
            ) : (
                <Input
                    label={TR('settings_field_value')}
                    name="value"
                    required
                    placeholder=""
                    value={typeof formData.value === 'object' ? JSON.stringify(formData.value) : formData.value ?? ''}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    hideErrorMessage
                />
            )}
        </section>

        <section className={styles.modalSection}>
            <h4 className={styles.modalSectionTitle}>{TR('settings_section_location')}</h4>
            <p className={styles.modalSectionHint}>{TR('settings_section_location_hint')}</p>
            <div className={styles.formGrid}>
                <Input
                    label={TR('settings_field_category')}
                    info={TR('settings_field_category_hint')}
                    name="category"
                    required
                    value={formData.category}
                    placeholder="appearance"
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    hideErrorMessage
                />
                <Input
                    label={TR('settings_field_sub_category')}
                    info={TR('settings_field_sub_category_hint')}
                    name="subCategory"
                    required
                    value={formData.subCategory}
                    placeholder="general"
                    onChange={(e) => setFormData({ ...formData, subCategory: e.target.value })}
                    hideErrorMessage
                />
            </div>
            <Field label={TR('settings_field_domain')} hint={TR('settings_field_domain_hint')}>
                <Select
                    options="domains"
                    value={formData.domainId}
                    onChange={(e) => setFormData({ ...formData, domainId: e.target.value })}
                    required
                    name="domainId"
                />
            </Field>
            <div className={styles.checkboxField}>
                <Checkbox
                    checked={!!formData.public}
                    onChange={(e) => setFormData({ ...formData, public: e.target.checked })}
                    label={TR('settings_field_public')}
                />
                <span className={styles.fieldHint}>{TR('settings_field_public_hint')}</span>
            </div>
        </section>

        <div className={styles.advanced}>
            <button
                type="button"
                className={styles.advancedToggle}
                onClick={() => setAdvancedOpen((open) => !open)}
                aria-expanded={advancedOpen}
            >
                <Icon name="settings" />
                {TR('settings_section_advanced')}
                <Icon name={advancedOpen ? 'down' : 'left'} className={styles.advancedChevron} />
            </button>
            {advancedOpen && (
                <div className={styles.advancedPanel}>
                    <p className={styles.modalSectionHint}>{TR('settings_section_advanced_hint')}</p>
                    <div className={styles.formGrid}>
                        <Field label={TR('settings_field_form_type')} hint={TR('settings_field_form_type_hint')}>
                            <Select
                                value={formData.formType}
                                onChange={(e) => setFormData({ ...formData, formType: e.target.value })}
                                options={formTypeOptions}
                            />
                        </Field>
                        <Field label={TR('settings_field_render_type')} hint={TR('settings_field_render_type_hint')}>
                            <Select
                                value={formData.renderType}
                                onChange={(e) => setFormData({ ...formData, renderType: e.target.value })}
                                options={renderTypeOptions}
                            />
                        </Field>
                    </div>
                </div>
            )}
        </div>

        {error && <div className={styles.modalError}>{error}</div>}

        <div className={styles.modalActions}>
            <Button type="button" onClick={onClose} disabled={loading}>
                {TR('cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
                {loading ? TR('saving') : TR(isEdit ? 'save' : 'settings_create')}
            </Button>
        </div>
    </form>
}
