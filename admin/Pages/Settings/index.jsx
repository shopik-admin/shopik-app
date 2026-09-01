import { useState, useMemo, useEffect } from 'react'
import { useModal } from 'common/components/Modal'
import Button from 'common/components/Button'
import useApi from 'common/functions/useApi'
import apiReq from 'common/functions/apiReq'
import Input from 'common/components/Input'
import Select from 'common/components/Select'
import styles from './settings.module.css'
import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import Setting from './Setting.jsx'
import ConfigEditor from './ConfigEditor.jsx'

const FORM_TYPES = [
    'text', 'checkbox', 'switch', 'color', 'select',
    'file', 'image', 'textarea', 'date', 'info', 'link', 'css', 'config'
]

const RENDER_TYPES = [
    'string', 'tr', 'image', 'color', 'list', 'field', 'name', 'id',
    'address', 'date', 'time', 'datetime', 'boolean', 'v-boolean',
    'color-boolean', 'nis', 'coin', 'mr', 'config'
]

function SettingModalContent({ setting, defaultCategory, onSuccess, onClose }) {
    const isEdit = !!setting
    const initialIsConfig = setting?.formType === 'config' || setting?.renderType === 'config'
    const [formData, setFormData] = useState({
        key: setting?.key || '',
        value: setting?.value !== undefined ? setting.value : (initialIsConfig ? {} : ''),
        category: setting?.category || defaultCategory || 'General',
        subCategory: setting?.subCategory || 'General',
        domainId: setting?.domainId || 'default',
        formType: setting?.formType || 'text',
        renderType: setting?.renderType || 'string'
    })
    const [error, setError] = useState(null)
    const [loading, setLoading] = useState(false)

    async function handleSubmit(e) {
        e.preventDefault()
        setLoading(true)
        setError(null)
        try {
            let result
            if (isEdit) {
                result = await apiReq('setting/update', { id: setting.id, ...formData })
            } else {
                result = await apiReq('setting/create', formData)
            }
            onSuccess(result || { ...(setting || {}), ...formData })
            onClose()
        } catch (err) {
            setError(err?.message || `Failed to ${isEdit ? 'update' : 'create'} setting`)
        } finally {
            setLoading(false)
        }
    }

    const isConfig = formData.formType === 'config' || formData.renderType === 'config'
    const isColor = formData.formType === 'color'

    function normalizeColorValue(val) {
        if (val && typeof val === 'object' && ('light' in val || 'dark' in val)) return val
        if (typeof val === 'string' && val) return { light: val, dark: val }
        return { light: '#000000', dark: '#ffffff' }
    }

    return (
        <form onSubmit={handleSubmit} className={styles.modalForm}>
            <Input
                label="Key"
                name="key"
                required
                value={formData.key}
                onChange={(e) => setFormData({ ...formData, key: e.target.value })}
            />
            <div className={styles.formGrid}>
                <label className={styles.settingInfo}>
                    <span className={styles.settingKey}>Form Type</span>
                    <Select
                        value={formData.formType}
                        onChange={(e) => setFormData({ ...formData, formType: e.target.value })}
                        options={FORM_TYPES}
                    />
                </label>
                <label className={styles.settingInfo}>
                    <span className={styles.settingKey}>Render Type</span>
                    <Select
                        value={formData.renderType}
                        onChange={(e) => setFormData({ ...formData, renderType: e.target.value })}
                        options={RENDER_TYPES}
                    />
                </label>
            </div>
            <div className={styles.formGrid}>
                <Input
                    label="Category"
                    name="category"
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                />
                <Input
                    label="Sub Category"
                    name="subCategory"
                    required
                    value={formData.subCategory}
                    onChange={(e) => setFormData({ ...formData, subCategory: e.target.value })}
                />
            </div>
            <label className={styles.settingInfo}>
                <span className={styles.settingKey}>Domain *</span>
                <Select
                    options="domains"
                    value={formData.domainId}
                    onChange={(e) => setFormData({ ...formData, domainId: e.target.value })}
                    required
                    name="domainId"
                />
            </label>
            {isConfig ? (
                <div>
                    <span className={styles.settingKey}>Value (config)</span>
                    <ConfigEditor
                        value={typeof formData.value === 'object' && formData.value !== null && !Array.isArray(formData.value) ? formData.value : {}}
                        onChange={(next) => setFormData({ ...formData, value: next })}
                    />
                </div>
            ) : isColor ? (
                <div className={styles.formGrid}>
                    <label className={styles.settingInfo}>
                        <span className={styles.settingKey}>Light</span>
                        <input type="color" className={styles.inlineColorInput} value={normalizeColorValue(formData.value).light} onChange={(e) => setFormData({ ...formData, value: { ...normalizeColorValue(formData.value), light: e.target.value } })} />
                    </label>
                    <label className={styles.settingInfo}>
                        <span className={styles.settingKey}>Dark</span>
                        <input type="color" className={styles.inlineColorInput} value={normalizeColorValue(formData.value).dark} onChange={(e) => setFormData({ ...formData, value: { ...normalizeColorValue(formData.value), dark: e.target.value } })} />
                    </label>
                </div>
            ) : (
                <Input
                    label="Value"
                    name="value"
                    required
                    value={typeof formData.value === 'object' ? JSON.stringify(formData.value) : formData.value ?? ''}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                />
            )}
            {error && (
                <div className={styles.settingError}>{error}</div>
            )}

            <div className={styles.modalActions}>
                <Button
                    onClick={onClose}
                    disabled={loading}
                >
                    Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                    {loading ? 'saving' : isEdit ? 'Save' : 'Add'}
                </Button>
            </div>
        </form>
    )
}

export default function Settings() {
    const { data: rawSettings = [], callReq, loading } = useApi('setting/read')
    const [settings, setSettings] = useState([])
    const [selectedCategory, setSelectedCategory] = useState(null)
    const [mobileView, setMobileView] = useState('sidebar') // 'sidebar' or 'content'
    const { openModal, closeModal } = useModal()

    useEffect(() => {
        if (Array.isArray(rawSettings)) {
            setSettings(rawSettings)
        }
    }, [rawSettings])

    // Extract unique categories & their item counts
    const categoryMap = useMemo(() => {
        const map = new Map()
        settings.forEach((s) => {
            const cat = s.category || 'General'
            if (!map.has(cat)) {
                map.set(cat, [])
            }
            map.get(cat).push(s)
        })
        return map
    }, [settings])

    const categories = useMemo(() => Array.from(categoryMap.keys()), [categoryMap])

    // Select first category by default when available
    useEffect(() => {
        if (!selectedCategory && categories.length > 0) {
            setSelectedCategory(categories[0])
        }
    }, [categories, selectedCategory])

    function handleSelectCategory(cat) {
        setSelectedCategory(cat)
        setMobileView('content')
    }

    function handleSettingUpdate(updatedSetting) {
        setSettings((prev) =>
            prev.map((s) => (s.id === updatedSetting.id ? { ...s, ...updatedSetting } : s))
        )
    }

    function handleAddModal(defaultCat = '') {
        const targetCategory = defaultCat || selectedCategory || 'General'
        openModal(
            <SettingModalContent
                defaultCategory={targetCategory}
                onClose={closeModal}
                onSuccess={(created) => {
                    callReq()
                    if (created) {
                        setSettings((prev) => [...prev, created])
                        if (created.category) {
                            setSelectedCategory(created.category)
                        }
                    }
                }}
            />,
            { title: 'Add New Setting' }
        )
    }

    function handleEditModal(settingToEdit) {
        openModal(
            <SettingModalContent
                setting={settingToEdit}
                onClose={closeModal}
                onSuccess={(updated) => {
                    callReq()
                    handleSettingUpdate(updated)
                }}
            />,
            { title: `Edit Setting (${settingToEdit.key})` }
        )
    }

    // Settings for current active category grouped by subCategory
    const activeCategorySettings = useMemo(() => {
        if (!selectedCategory) return {}
        const list = categoryMap.get(selectedCategory) || []
        const grouped = {}
        list.forEach((setting) => {
            const sub = setting.subCategory || 'General'
            if (!grouped[sub]) {
                grouped[sub] = []
            }
            grouped[sub].push(setting)
        })
        return grouped
    }, [selectedCategory, categoryMap])

    return (
        <Flex tag={Card} className={`${styles.settingsContainer} ${styles[mobileView]}`}>
            {/* Category Sidebar List (Not a tree, based on category schema) */}
            <div className={styles.categoriesSidebar}>
                <div className={styles.sidebarHeaderRow}>
                    <h3 className={styles.sidebarHeader}>Settings</h3>
                    <Button size="s" icon="add" onClick={() => handleAddModal()} title="Add Setting" />
                </div>

                <ul className={styles.categoryList}>
                    {categories.map((cat) => {
                        const count = categoryMap.get(cat)?.length || 0
                        const isActive = cat === selectedCategory
                        return (
                            <li
                                key={cat}
                                className={`${styles.categoryItem} ${isActive ? styles.active : ''}`}
                                onClick={() => handleSelectCategory(cat)}
                            >
                                <span>{cat}</span>
                                <span className={styles.categoryCount}>{count}</span>
                            </li>
                        )
                    })}
                </ul>
            </div>

            {/* Settings Body - iOS / Android Inset Grouping by subCategory */}
            <div className={styles.settingsBody}>
                <Button
                    className={styles.backButton}
                    icon="back"
                    onClick={() => setMobileView('sidebar')}
                >
                    Back to categories
                </Button>

                {selectedCategory ? (
                    <>
                        <div className={styles.categoryTitleRow}>
                            <h2 className={styles.categoryTitle}>{selectedCategory}</h2>
                        </div>

                        {Object.keys(activeCategorySettings).length === 0 ? (
                            <div className={styles.emptyState}>No settings in this category</div>
                        ) : (
                            <div className={styles.sectionsList}>
                                {Object.entries(activeCategorySettings).map(([subCat, subCatSettings]) => (
                                    <div key={subCat} className={styles.subCategoryGroup}>
                                        <h4 className={styles.subCategoryHeader}>{subCat}</h4>
                                        <div className={styles.insetGroupCard}>
                                            {subCatSettings.map((setting) => (
                                                <Setting
                                                    key={setting.id || setting.key}
                                                    setting={setting}
                                                    onUpdate={handleSettingUpdate}
                                                    onEditFull={handleEditModal}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : loading ? (
                    <div className={styles.emptyState}>Loading settings...</div>
                ) : (
                    <div className={styles.emptyState} style={{ flexDirection: 'column', gap: '1rem' }}>
                        <span>No settings yet</span>
                        <Button icon="add" onClick={() => handleAddModal()}>Add Setting</Button>
                    </div>
                )}
            </div>
        </Flex>
    )
}
