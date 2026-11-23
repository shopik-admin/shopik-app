import { useEffect, useMemo, useRef, useState } from 'react'
import { useModal } from 'common/components/Modal'
import { useUser } from 'features/User'
import Button from 'common/components/Button'
import Card from 'common/components/Card'
import Checkbox from 'common/components/Checkbox'
import Flex from 'common/components/Flex'
import Input from 'common/components/Input'
import Select from 'common/components/Select'
import Text from 'common/components/Text'
import { useText } from 'common/texts/TextProvider'
import apiReq from 'common/functions/apiReq'
import { BASE_LANGUAGE } from 'common/constants/translations.js'
import styles from './translations.module.css'

const PAGE_SIZE = 100
const BASE_CODE = 'he'

function downloadBase64({ filename, contentType, fileBase64 }) {
    const binary = atob(fileBase64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: contentType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function readFileBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            const result = String(reader.result || '')
            resolve(result.includes(',') ? result.split(',').pop() : result)
        }
        reader.onerror = () => reject(reader.error || new Error('failed to read file'))
        reader.readAsDataURL(file)
    })
}

function languageLabel(language) {
    return language?.nativeName || language?.name || language?.code || ''
}

function TextModal({ entry, language, canDelete, onClose, onSaved }) {
    const { TR } = useText()
    const raw = entry?.values?.[language.code] || ''
    const isEdit = !!raw
    const [key, setKey] = useState(entry?.key || '')
    const [value, setValue] = useState(raw)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)

    async function save() {
        setError(null)
        if (!entry && !key.trim()) {
            setError(TR('translations_key_hint'))
            return
        }

        setSaving(true)
        try {
            if (entry && !value.trim()) {
                if (isEdit) {
                    await apiReq('translation/delete', { languageCode: language.code, key: entry.key })
                    onSaved?.()
                } else onClose?.()
                return
            }

            if (isEdit) {
                if (value === raw) {
                    onClose?.()
                    return
                }
                await apiReq('translation/update', {
                    languageCode: language.code,
                    key: entry.key,
                    value
                })
            } else {
                await apiReq('translation/create', {
                    languageCode: language.code,
                    key: entry?.key || key.trim(),
                    value
                })
            }

            onSaved?.()
        } catch (err) {
            setError(err?.message || TR('translations_save_failed'))
        } finally {
            setSaving(false)
        }
    }

    async function remove() {
        if (!isEdit) return
        if (!window.confirm(TR('translations_delete') + '?')) return
        setSaving(true)
        setError(null)
        try {
            await apiReq('translation/delete', { languageCode: language.code, key: entry.key })
            onSaved?.()
        } catch (err) {
            setError(err?.message || TR('translations_delete_failed'))
        } finally {
            setSaving(false)
        }
    }

    return <div className={styles.modalForm}>
        <Input
            label={TR('translations_key')}
            value={entry?.key || key}
            onChange={event => setKey(event.target.value)}
            disabled={!!entry}
            required
        />
        <div>
            <Text size='s' className={styles.muted}>{TR('translations_base')}</Text>
            <div className={styles.basePreview}>{entry?.effective?.[BASE_CODE] || entry?.base || '—'}</div>
        </div>
        <Input
            label={TR('translations_value')}
            type='textarea'
            rows={7}
            dir={language.direction === 'ltr' ? 'ltr' : 'rtl'}
            value={value}
            onChange={event => setValue(event.target.value)}
        />
        <Text size='xs' className={styles.hint}>{TR('translations_language')}: {languageLabel(language)} ({language.code})</Text>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.modalActions}>
            {isEdit && canDelete && <Button onClick={remove} disabled={saving}>{TR('translations_delete')}</Button>}
            <Button onClick={onClose} disabled={saving}>{TR('translations_cancel')}</Button>
            <Button onClick={save} loading={saving} disabled={saving}>{TR('translations_save')}</Button>
        </div>
    </div>
}

function LanguageModal({ language, canDelete, onClose, onSaved, onDeleted }) {
    const { TR } = useText()
    const editing = !!language
    const [form, setForm] = useState({
        code: language?.code || '',
        name: language?.name || '',
        nativeName: language?.nativeName || '',
        direction: language?.direction || 'rtl',
        flag: language?.flag || ''
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)

    function update(field, value) {
        setForm(previous => ({ ...previous, [field]: value }))
    }

    async function save() {
        setSaving(true)
        setError(null)
        try {
            const result = editing
                ? await apiReq('translation/update_language', { id: language.id, ...form })
                : await apiReq('translation/create_language', form)
            onSaved?.(result)
        } catch (err) {
            setError(err?.message || TR('translations_save_failed'))
        } finally {
            setSaving(false)
        }
    }

    async function remove() {
        if (!editing || !canDelete) return
        if (!window.confirm(TR('translations_delete_language_confirm'))) return
        setSaving(true)
        setError(null)
        try {
            await apiReq('translation/delete_language', { id: language.id })
            onDeleted?.(language)
        } catch (err) {
            setError(err?.message || TR('translations_delete_failed'))
        } finally {
            setSaving(false)
        }
    }

    return <div className={styles.modalForm}>
        <div className={styles.formRow}>
            <Input
                label={TR('translations_code')}
                value={form.code}
                onChange={event => update('code', event.target.value.toLowerCase())}
                disabled={editing}
                required
            />
            <Input
                label={TR('translations_direction')}
                type='select'
                options={[
                    { value: 'rtl', text: TR('translations_direction_rtl') },
                    { value: 'ltr', text: TR('translations_direction_ltr') }
                ]}
                value={form.direction}
                onChange={event => update('direction', event.target.value)}
            />
        </div>
        <div className={styles.formRow}>
            <Input
                label={TR('translations_name')}
                value={form.name}
                onChange={event => update('name', event.target.value)}
                required
            />
            <Input
                label={TR('translations_native_name')}
                value={form.nativeName}
                onChange={event => update('nativeName', event.target.value)}
            />
        </div>
        <Input
            label={TR('translations_flag')}
            value={form.flag}
            onChange={event => update('flag', event.target.value)}
        />
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.modalActions}>
            {editing && canDelete && <Button onClick={remove} disabled={saving}>{TR('translations_delete_language')}</Button>}
            <Button onClick={onClose} disabled={saving}>{TR('translations_cancel')}</Button>
            <Button onClick={save} loading={saving} disabled={saving}>{TR('translations_save')}</Button>
        </div>
    </div>
}

function ExportModal({ language, onClose }) {
    const { TR } = useText()
    const [format, setFormat] = useState('xlsx')
    const [allLanguages, setAllLanguages] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    async function run() {
        setLoading(true)
        setError(null)
        try {
            const file = await apiReq('translation/export', {
                format,
                allLanguages,
                code: language?.code || BASE_CODE
            })
            downloadBase64(file)
            onClose?.()
        } catch (err) {
            setError(err?.message || TR('translations_export_title'))
        } finally {
            setLoading(false)
        }
    }

    return <div className={styles.modalForm}>
        <Select
            options={[
                { value: 'xlsx', text: TR('translations_export_xlsx') },
                { value: 'csv', text: TR('translations_export_csv') }
            ]}
            value={format}
            onChange={event => setFormat(event.target.value)}
        />
        <label className={styles.checkboxLabel}>
            <Checkbox checked={allLanguages} onChange={event => setAllLanguages(event.target.checked)} />
            <span>{TR('translations_export_all')}</span>
        </label>
        <Text size='xs' className={styles.hint}>
            {allLanguages ? TR('translations_export_all') : `${TR('translations_export_current')}: ${languageLabel(language)}`}
        </Text>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.modalActions}>
            <Button onClick={onClose} disabled={loading}>{TR('translations_cancel')}</Button>
            <Button onClick={run} loading={loading} disabled={loading}>{TR('translations_export_download')}</Button>
        </div>
    </div>
}

function ImportPreviewModal({ preview, fileBase64, filename, canImport, onClose, onImported }) {
    const { TR } = useText()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const canSubmit = canImport && (preview?.updates || 0) > 0

    async function confirm() {
        if (!canSubmit || loading) return
        setLoading(true)
        setError(null)
        try {
            const result = await apiReq('translation/import', {
                fileBase64,
                filename,
                languageCode: preview.languageCode
            })
            onImported?.(result)
        } catch (err) {
            setError(err?.message || TR('translations_import_failed'))
        } finally {
            setLoading(false)
        }
    }

    return <div className={styles.modalForm}>
        <Text size='s' className={styles.muted}>{TR('translations_import_summary')}</Text>
        <div className={styles.previewGrid}>
            <div className={styles.previewStat}>
                <Text size='xs' className={styles.muted}>{TR('translations_import_file')}</Text>
                <strong>{preview?.filename || filename}</strong>
            </div>
            <div className={styles.previewStat}>
                <Text size='xs' className={styles.muted}>{TR('translations_import_target')}</Text>
                <strong>{preview?.languageName || preview?.languageCode}</strong>
            </div>
            <div className={styles.previewStat}>
                <Text size='xs' className={styles.muted}>{TR('translations_import_rows')}</Text>
                <strong>{preview?.rows || 0}</strong>
            </div>
            <div className={styles.previewStat}>
                <Text size='xs' className={styles.muted}>{TR('translations_import_updates')}</Text>
                <strong>{preview?.updates || 0}</strong>
            </div>
            <div className={styles.previewStat}>
                <Text size='xs' className={styles.muted}>{TR('translations_import_skipped')}</Text>
                <strong>{preview?.skipped || 0}</strong>
            </div>
        </div>

        {!!preview?.sample?.length && <>
            <Text size='s' bold>{TR('translations_import_sample')}</Text>
            <div className={styles.previewList}>
                {preview.sample.map(item => <div key={item.key} className={styles.previewRow}>
                    <span className={styles.previewKey} dir='ltr'>{item.key}</span>
                    <span className={styles.previewValue} dir='auto'>{item.value}</span>
                </div>)}
            </div>
        </>}

        {!!preview?.errors?.length && <div className={styles.error}>
            {TR('translations_import_errors', { count: preview.errors.length })}
            {' — '}
            {preview.errors.slice(0, 8).map(item => `${item.key || item.row}: ${item.message}`).join('; ')}
        </div>}

        {!(preview?.updates > 0) && <div className={styles.notice}>{TR('translations_import_nothing')}</div>}
        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.modalActions}>
            <Button onClick={onClose} disabled={loading}>{TR('translations_cancel')}</Button>
            <Button onClick={confirm} loading={loading} disabled={!canSubmit || loading}>{TR('translations_import_confirm')}</Button>
        </div>
    </div>
}

export default function Translations() {
    const { TR, language, languages: contextLanguages, refreshLanguages, setLanguage, reloadLanguage } = useText() || {}
    const { isSuperAdmin, role } = useUser() || {}
    const { openModal, closeModal } = useModal()
    const [data, setData] = useState({ languages: [], entries: [], stats: [] })
    const [search, setSearch] = useState('')
    const [missingOnly, setMissingOnly] = useState(false)
    const [viewLanguage, setViewLanguage] = useState(language || BASE_CODE)
    const [editing, setEditing] = useState(null)
    const [savingEdit, setSavingEdit] = useState(false)
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [message, setMessage] = useState(null)
    const fileInputRef = useRef(null)

    const can = permission => !!isSuperAdmin || !!role?.permissions?.includes(permission)
    const canCreate = can('text:create')
    const canUpdate = can('text:update')
    const canDelete = can('text:delete')
    const canImport = canCreate && canUpdate

    const languages = data.languages?.length ? data.languages : (contextLanguages || [])
    const activeLanguage = languages.find(item => item.code === language)
        || languages.find(item => item.code === BASE_CODE)
        || languages[0]
        || BASE_LANGUAGE
    const viewValue = viewLanguage === 'all' || languages.some(item => item.code === viewLanguage)
        ? viewLanguage
        : BASE_CODE
    const viewLanguages = viewValue === 'all'
        ? languages
        : languages.filter(item => item.code === viewValue)
    const targetLanguage = languages.find(item => item.code === (viewValue === 'all' ? activeLanguage.code : viewValue))
        || activeLanguage
    const previewLanguages = viewLanguages.length ? viewLanguages : [targetLanguage]

    async function loadData({ quiet = false } = {}) {
        if (!quiet) setLoading(true)
        setError(null)
        try {
            const result = await apiReq('translation/read')
            setData({
                languages: result?.languages || [],
                entries: result?.entries || [],
                stats: result?.stats || []
            })
        } catch (err) {
            setError(err?.message || TR('translations_load_failed'))
        } finally {
            if (!quiet) setLoading(false)
        }
    }

    useEffect(() => {
        loadData()
    }, [])

    useEffect(() => {
        setPage(1)
    }, [search, missingOnly, language, viewValue])

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase()
        return (data.entries || []).filter(entry => {
            if (missingOnly) {
                const missingLanguages = previewLanguages.filter(item => item.code !== BASE_CODE)
                if (missingLanguages.length && !missingLanguages.some(item => !entry.values?.[item.code]))
                    return false
            }
            if (!query) return true
            return entry.key.toLowerCase().includes(query)
                || String(entry.base || '').toLowerCase().includes(query)
                || String(entry.effective?.[BASE_CODE] || '').toLowerCase().includes(query)
                || previewLanguages.some(item => String(entry.effective?.[item.code] || '').toLowerCase().includes(query))
        })
    }, [data.entries, search, missingOnly, previewLanguages])

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    const currentPage = Math.min(page, pageCount)
    const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
    const selectedStats = data.stats?.find(item => item.code === targetLanguage.code)

    function startEdit(entry, item) {
        const raw = entry?.values?.[item.code] || ''
        if (raw ? !canUpdate : !canCreate) return
        setError(null)
        setEditing({ entry, language: item, value: raw, raw })
    }

    function cancelEdit() {
        setEditing(null)
        setSavingEdit(false)
    }

    async function saveEdit() {
        if (!editing || savingEdit) return
        const { entry, language: item, value, raw } = editing
        if (value === raw) {
            cancelEdit()
            return
        }

        setSavingEdit(true)
        setError(null)
        try {
            if (!value.trim()) {
                if (raw) {
                    if (!canDelete) throw new Error(TR('translations_delete_failed'))
                    await apiReq('translation/delete', { languageCode: item.code, key: entry.key })
                }
            } else if (raw) {
                await apiReq('translation/update', { languageCode: item.code, key: entry.key, value })
            } else {
                await apiReq('translation/create', { languageCode: item.code, key: entry.key, value })
            }
            setEditing(null)
            await loadData({ quiet: true })
        } catch (err) {
            setError(err?.message || TR('translations_save_failed'))
        } finally {
            setSavingEdit(false)
        }
    }

    function openAdd() {
        if (!canCreate) return
        openModal(
            <TextModal
                language={targetLanguage}
                canDelete={canDelete}
                onClose={closeModal}
                onSaved={() => {
                    closeModal()
                    loadData({ quiet: true })
                }}
            />,
            { title: TR('translations_add_title') }
        )
    }

    function openLanguage(languageToEdit) {
        if (languageToEdit ? !canUpdate : !canCreate) return
        openModal(
            <LanguageModal
                language={languageToEdit}
                canDelete={canDelete}
                onClose={closeModal}
                onSaved={async created => {
                    closeModal()
                    await refreshLanguages?.()
                    await loadData({ quiet: true })
                    setMessage(TR(languageToEdit ? 'translations_language_saved' : 'translations_language_created'))
                    if (!languageToEdit && created?.code) await applyLanguage(created.code)
                    else if (languageToEdit?.code === language) await reloadLanguage?.()
                }}
                onDeleted={async deleted => {
                    closeModal()
                    await refreshLanguages?.()
                    await loadData({ quiet: true })
                    setMessage(TR('translations_language_deleted'))
                    if (deleted?.code === language) await applyLanguage(BASE_CODE)
                }}
            />,
            { title: TR(languageToEdit ? 'translations_edit_language_title' : 'translations_new_language_title') }
        )
    }

    async function applyLanguage(code) {
        try { await setLanguage?.(code) } catch { }
    }

    function openExport() {
        openModal(
            <ExportModal language={targetLanguage} onClose={closeModal} />,
            { title: TR('translations_export_title') }
        )
    }

    async function importFile(event) {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file || !canImport) return
        setError(null)
        setMessage(null)
        try {
            const fileBase64 = await readFileBase64(file)
            const preview = await apiReq('translation/import_preview', {
                fileBase64,
                filename: file.name,
                languageCode: targetLanguage.code
            })
            openModal(
                <ImportPreviewModal
                    preview={preview}
                    fileBase64={fileBase64}
                    filename={file.name}
                    canImport={canImport}
                    onClose={closeModal}
                    onImported={async result => {
                        closeModal()
                        await loadData({ quiet: true })
                        setMessage(TR('translations_import_done', {
                            updated: result?.updated || 0,
                            skipped: result?.skipped || 0
                        }))
                        if (result?.errors?.length)
                            setError(`${TR('translations_import_errors', { count: result.errors.length })}: ${result.errors.slice(0, 5).map(item => `${item.key}: ${item.message}`).join('; ')}`)
                    }}
                />,
                { title: TR('translations_import_preview_title') }
            )
        } catch (err) {
            setError(err?.message || TR('translations_import_failed'))
        }
    }

    return <Card className={styles.page}>
        <div className={styles.header}>
            <div className={styles.headerText}>
                <Text size='h2' tag='h1' bold>{TR('translations_title')}</Text>
                <Text className={styles.muted}>{TR('translations_subtitle')}</Text>
            </div>
            <div className={styles.actions}>
                {canCreate && <Button icon='add' onClick={openAdd}>{TR('translations_add_text')}</Button>}
                {canCreate && <Button icon='language' onClick={() => openLanguage(null)}>{TR('translations_new_language')}</Button>}
                <Button icon='download' onClick={openExport}>{TR('translations_export')}</Button>
                {canImport && <Button icon='upload' onClick={() => fileInputRef.current?.click()}>{TR('translations_import')}</Button>}
                <input
                    ref={fileInputRef}
                    type='file'
                    accept='.xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    onChange={importFile}
                    style={{ display: 'none' }}
                />
            </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {message && <div className={styles.message}>{message}</div>}

        <div className={styles.toolbar}>
            <Input
                className={styles.search}
                placeholder={TR('translations_search')}
                value={search}
                onChange={event => setSearch(event.target.value)}
            />
            <Select
                className={styles.viewLanguage}
                title={TR('translations_view_language')}
                value={viewValue}
                onChange={event => setViewLanguage(event.target.value)}
                options={[
                    { value: 'all', text: TR('translations_all_languages') },
                    ...languages.map(item => ({ value: item.code, text: languageLabel(item) }))
                ]}
            />
            <label className={styles.checkboxLabel}>
                <Checkbox checked={missingOnly} onChange={event => setMissingOnly(event.target.checked)} />
                <span>{TR('translations_missing_only')}</span>
            </label>
        </div>

        <div className={styles.stats}>
            <span className={styles.statBadge}>{TR('translations_total')}: {data.entries?.length || 0}</span>
            {viewValue !== 'all' && <span className={styles.statBadge}>{languageLabel(targetLanguage)}: {selectedStats?.overrides || 0} {TR('translations_overrides')}</span>}
            {viewValue !== 'all' && targetLanguage.code !== BASE_CODE && <span className={styles.statBadge}>{TR('translations_missing')}: {selectedStats?.missing || 0}</span>}
        </div>

        {loading ? <div className={styles.empty}>{TR('translations_loading')}</div> : <div className={styles.tableWrap}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th className={styles.keyCell} dir='auto'>{TR('translations_key')}</th>
                        {previewLanguages.map(item => <th key={item.code} className={styles.valueCell} dir={item.direction === 'ltr' ? 'ltr' : 'rtl'}>
                            <div className={styles.languageHeader}>
                                <span>{languageLabel(item)} <span className={styles.languageCode}>{item.code}</span></span>
                                {item.code !== BASE_CODE && canUpdate && <Button
                                    size='s'
                                    mode='text'
                                    icon='edit'
                                    tooltip={TR('translations_edit_language_title')}
                                    onClick={() => openLanguage(item)}
                                />}
                            </div>
                        </th>)}
                    </tr>
                </thead>
                <tbody>
                    {visible.map(entry => <tr key={entry.key}>
                        <td className={styles.keyCell} dir='ltr'>
                            <span className={styles.keyText}>{entry.key}</span>
                            {entry.custom && <span className={styles.keyBadge}>{TR('translations_custom')}</span>}
                        </td>
                        {previewLanguages.map(item => {
                            const raw = entry.values?.[item.code] || ''
                            const effective = entry.effective?.[item.code] || ''
                            const source = entry.sources?.[item.code]
                            const isEditing = editing?.entry?.key === entry.key && editing?.language?.code === item.code
                            // A Hebrew fallback in an English column still displays
                            // Hebrew, so it must align right; a real English value
                            // aligns left. The column's target language only drives
                            // the editor and the header.
                            const displayDirection = raw
                                ? item.direction
                                : effective
                                    ? 'rtl'
                                    : item.direction
                            return <td key={item.code} className={styles.valueCell} dir={isEditing ? item.direction : displayDirection}>
                                {isEditing ? <div className={styles.inlineEditor}>
                                    <textarea
                                        className={styles.inlineTextarea}
                                        dir={item.direction === 'ltr' ? 'ltr' : 'rtl'}
                                        value={editing.value}
                                        placeholder={!raw ? effective : ''}
                                        title={TR('translations_inline_hint')}
                                        autoFocus
                                        onChange={event => setEditing(previous => ({ ...previous, value: event.target.value }))}
                                        onKeyDown={event => {
                                            if (event.key === 'Escape') {
                                                event.preventDefault()
                                                cancelEdit()
                                            } else if (event.key === 'Enter' && !event.shiftKey) {
                                                event.preventDefault()
                                                saveEdit()
                                            }
                                        }}
                                        disabled={savingEdit}
                                    />
                                    <div className={styles.inlineActions}>
                                        <Button size='s' mode='text' icon='check' tooltip={TR('translations_save')} onClick={saveEdit} loading={savingEdit} disabled={savingEdit} />
                                        <Button size='s' mode='text' icon='x' tooltip={TR('translations_cancel')} onClick={cancelEdit} disabled={savingEdit} />
                                    </div>
                                </div> : <button
                                    type='button'
                                    className={styles.cellButton}
                                    dir={displayDirection}
                                    onClick={() => startEdit(entry, item)}
                                >
                                    {raw && <span className={styles.overrideDot} />}
                                    {raw
                                        ? <bdi dir={displayDirection}>{raw}</bdi>
                                        : effective
                                            ? <span className={styles.fallback}><bdi dir={displayDirection}>{effective}</bdi></span>
                                            : <span className={styles.missing}>{TR('translations_missing')}</span>}
                                    {source === 'fallback' && !raw && <span className={styles.missing}> · {TR('translations_fallback')}</span>}
                                </button>}
                            </td>
                        })}
                    </tr>)}
                </tbody>
            </table>
            {!visible.length && <div className={styles.empty}>{TR('translations_no_results')}</div>}
        </div>}

        {!loading && filtered.length > PAGE_SIZE && <div className={styles.pager}>
            <span>{TR('translations_page_of', { page: currentPage, pages: pageCount })}</span>
            <div className={styles.pagerButtons}>
                <Button size='s' onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}>{TR('translations_prev')}</Button>
                <Button size='s' onClick={() => setPage(Math.min(pageCount, currentPage + 1))} disabled={currentPage >= pageCount}>{TR('translations_next')}</Button>
            </div>
        </div>}
    </Card>
}
