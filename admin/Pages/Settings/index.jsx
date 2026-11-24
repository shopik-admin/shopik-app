import { useState, useMemo, useEffect, useRef } from 'react'
import { useModal } from 'common/components/Modal'
import { useLists } from 'common/features/Lists'
import { useUser } from 'features/User'
import { useText } from 'common/texts/TextProvider'
import Button from 'common/components/Button'
import ContextMenu from 'common/components/ContextMenu'
import Icon from 'common/components/Icon'
import useApi from 'common/functions/useApi'
import apiReq from 'common/functions/apiReq'
import Select from 'common/components/Select'
import styles from './settings.module.css'
import Setting from './Setting.jsx'
import SettingModal from './SettingModal.jsx'
import {
    categoryLabel,
    settingHint,
    settingLabel
} from './settingsKeys'

const EMPTY_DOMAINS = []

// Sidebar icon per category; unknown categories fall back to the gear.
const CATEGORY_ICONS = {
    appearance: 'image',
    theme: 'sparkles',
    integrations: 'combine',
    seo: 'search',
    payment: 'card',
    shipping: 'truck',
    system: 'desktop',
    limits: 'filter',
    notifications: 'notifications',
    orders: 'orders',
    order: 'orders',
    general: 'settings',
    language: 'language',
    customerservice: 'phone',
    footer: 'scrollText'
}

export default function Settings() {
    const { data: rawSettings, callReq, loading } = useApi('setting/read')
    const { TR, language } = useText()
    const [settings, setSettings] = useState([])
    const rawRef = useRef()
    const [selectedDomain, setSelectedDomain] = useState(null)
    const [selectedCategory, setSelectedCategory] = useState(null)
    const [search, setSearch] = useState('')
    const [mobileView, setMobileView] = useState('sidebar') // 'sidebar' or 'content'
    const { openModal, closeModal } = useModal()
    const { isSuperAdmin, role: adminRole } = useUser()
    const { domains = EMPTY_DOMAINS } = useLists() || {}
    const fileInputRef = useRef(null)

    // Default the working domain to the isDefault domain (first domain as fallback)
    useEffect(() => {
        if (!selectedDomain && domains.length) {
            const def = domains.find((d) => d?.isDefault)
            const first = def ?? domains[0]
            setSelectedDomain(first?.value ?? first)
        }
    }, [domains, selectedDomain])

    function domainNameOf(id) {
        const found = domains.find((d) => (d?.value ?? d) === id)
        return found?.text || found?.name || id
    }

    const canDeleteSetting = isSuperAdmin || adminRole?.permissions?.includes('setting:delete')
    const canCreateSetting = isSuperAdmin || adminRole?.permissions?.includes('setting:create')
    const canUpdateSetting = isSuperAdmin || adminRole?.permissions?.includes('setting:update')
    // Strict AND: import does both creates and updates, mirroring server permissions
    const canImport = isSuperAdmin || (canCreateSetting && canUpdateSetting)

    useEffect(() => {
        if (Array.isArray(rawSettings) && rawRef.current !== rawSettings) {
            rawRef.current = rawSettings
            setSettings(rawSettings)
        }
    }, [rawSettings])

    // Work one domain at a time — export/import/add scope to selectedDomain
    const domainSettings = useMemo(() => {
        if (!selectedDomain) return []
        return settings.filter((s) => s.domainId === selectedDomain && !s.hidden)
    }, [settings, selectedDomain])

    // Extract unique categories & their item counts
    const categoryMap = useMemo(() => {
        const map = new Map()
        domainSettings.forEach((s) => {
            const cat = s.category || 'general'
            if (!map.has(cat)) {
                map.set(cat, [])
            }
            map.get(cat).push(s)
        })
        return map
    }, [domainSettings])

    const categories = useMemo(() => Array.from(categoryMap.keys()), [categoryMap])

    // Select first category by default; reset when switching domains
    useEffect(() => {
        if (!categories.includes(selectedCategory)) {
            setSelectedCategory(categories.length > 0 ? categories[0] : null)
        }
    }, [categories, selectedCategory])

    const query = search.trim().toLowerCase()
    const isSearching = query.length > 0

    // Search across the domain: raw key, translated label/hint and the group names
    const searchMatches = useMemo(() => {
        if (!query) return []
        return domainSettings.filter((setting) => {
            const haystack = [
                setting.key,
                setting.category,
                setting.subCategory,
                settingLabel(TR, setting),
                settingHint(TR, setting),
                categoryLabel(TR, setting.category)
            ].filter(Boolean).join(' ').toLowerCase()
            return haystack.includes(query)
        })
    }, [domainSettings, query, TR, language])

    const searchGroups = useMemo(() => {
        const map = new Map()
        searchMatches.forEach((setting) => {
            const cat = setting.category || 'general'
            if (!map.has(cat)) map.set(cat, [])
            map.get(cat).push(setting)
        })
        return Array.from(map.entries())
    }, [searchMatches])

    function handleSelectCategory(cat) {
        setSelectedCategory(cat)
        setSearch('')
        setMobileView('content')
    }

    function handleDomainChange(e) {
        setSelectedDomain(e.target.value)
        setSearch('')
        setMobileView('sidebar')
    }

    function backToCategories() {
        setSearch('')
        setMobileView('sidebar')
    }

    function handleSettingUpdate(updatedSetting) {
        setSettings((prev) =>
            prev.map((s) => (s.id === updatedSetting.id ? { ...s, ...updatedSetting } : s))
        )
    }

    function handleDelete(id) {
        setSettings((prev) => prev.filter((s) => s.id !== id))
    }

    function handleAddModal(defaultCat = '', defaultSubCat = '', defaultFormType, defaultRenderType) {
        const targetCategory = defaultCat || selectedCategory || 'general'
        const targetSubCategory = defaultSubCat || 'general'
        const targetFormType = defaultFormType || 'text'
        const targetRenderType = defaultRenderType || 'string'
        const isConfigAdd = targetFormType === 'config' || targetRenderType === 'config'
        if (isConfigAdd && !isSuperAdmin) return
        if (!isConfigAdd && !canCreateSetting) return
        openModal(
            <SettingModal
                defaultCategory={targetCategory}
                defaultSubCategory={targetSubCategory}
                defaultDomainId={selectedDomain || ''}
                defaultFormType={targetFormType}
                defaultRenderType={targetRenderType}
                onClose={closeModal}
                onSuccess={(created) => {
                    callReq()
                    if (created) {
                        if (created.domainId && created.domainId !== selectedDomain) {
                            setSelectedDomain(created.domainId)
                        }
                        setSettings((prev) => [...prev, created])
                        if (created.category) {
                            setSelectedCategory(created.category)
                        }
                    }
                }}
            />,
            { title: TR('settings_add_title') }
        )
    }

    function scopeFileName(scope = {}) {
        const date = new Date().toISOString().slice(0, 10)
        const parts = ['settings', scope.domainId || null, scope.category, scope.subCategory].filter(Boolean)
            .map((p) => String(p).replace(/[^\w-]+/g, '-'))
        return `${parts.join('-') || 'settings'}-${date}.json`
    }

    async function handleExport(scope = {}) {
        if (!selectedDomain) return
        const data = await apiReq('setting/export', { domainId: selectedDomain, ...scope })
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = scopeFileName(data?.scope || scope)
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    function handleImportClick() {
        fileInputRef.current?.click()
    }

    async function handleImportFile(e) {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        let parsed
        try {
            parsed = JSON.parse(await file.text())
        } catch {
            openModal(<p className={styles.modalIntro}>{TR('settings_import_invalid_json')}</p>, { title: TR('settings_import_failed') })
            return
        }
        const list = Array.isArray(parsed?.settings) ? parsed.settings : Array.isArray(parsed) ? parsed : null
        if (!list) {
            openModal(<p className={styles.modalIntro}>{TR('settings_import_invalid_format')}</p>, { title: TR('settings_import_failed') })
            return
        }
        try {
            const targetDomain = selectedDomain
            if (!targetDomain) {
                openModal(<p className={styles.modalIntro}>{TR('settings_import_no_domain')}</p>, { title: TR('settings_import_failed') })
                return
            }
            const res = await apiReq('setting/import', { settings: list, domainId: targetDomain })
            callReq()
            const lines = [
                TR('settings_import_summary_domain', { name: domainNameOf(res.domainId || targetDomain) }),
                TR('settings_import_summary_created', { count: res.created }),
                TR('settings_import_summary_updated', { count: res.updated })
            ]
            if (res.skippedConfig?.length) lines.push(TR('settings_import_summary_skipped', { keys: res.skippedConfig.join(', ') }))
            if (res.errors?.length) lines.push(TR('settings_import_summary_errors', { list: res.errors.map((x) => `${x.key}: ${x.message}`).join('; ') }))
            openModal(<p className={styles.modalIntro} style={{ whiteSpace: 'pre-wrap' }}>{lines.join('\n')}</p>, { title: TR('settings_import_done') })
        } catch (err) {
            openModal(<p className={styles.modalIntro}>{err?.message || TR('settings_import_failed')}</p>, { title: TR('settings_import_failed') })
        }
    }

    function handleEditModal(settingToEdit) {
        openModal(
            <SettingModal
                setting={settingToEdit}
                onClose={closeModal}
                onSuccess={(updated) => {
                    callReq()
                    handleSettingUpdate(updated)
                }}
            />,
            { title: TR('settings_edit_title', { key: settingToEdit.key }) }
        )
    }

    // Settings for the current active category, in data order
    const activeCategorySettings = useMemo(() => {
        if (!selectedCategory) return []
        return categoryMap.get(selectedCategory) || []
    }, [selectedCategory, categoryMap])

    function renderSetting(setting) {
        return <Setting
            key={setting.id || setting.key}
            setting={setting}
            onUpdate={handleSettingUpdate}
            onEditFull={handleEditModal}
            onDelete={canDeleteSetting ? handleDelete : undefined}
        />
    }

    const pageMenuOptions = [
        selectedCategory && {
            text: 'settings_export_category',
            icon: 'download',
            mode: 'text',
            onClick: () => handleExport({ category: selectedCategory })
        },
        {
            text: 'settings_export_all',
            icon: 'download',
            mode: 'text',
            separator: !!selectedCategory,
            onClick: () => handleExport({})
        },
        canImport && { text: 'settings_import', icon: 'upload', mode: 'text', separator: true, onClick: handleImportClick }
    ].filter(Boolean)

    return <div className={styles.page}>
        <div className={`${styles.layout} ${mobileView === 'sidebar' ? styles.viewSidebar : styles.viewContent}`}>
            <nav className={`${styles.nav} ${isSearching ? styles.navSearching : ''}`} aria-label={TR('settings')}>
                <div className={styles.searchBox}>
                    <Icon name="search" className={styles.searchIcon} />
                    <input
                        type="search"
                        className={styles.searchInput}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={TR('settings_search_placeholder')}
                        aria-label={TR('settings_search_placeholder')}
                    />
                </div>

                <nav className={styles.navList}>
                    {categories.map((cat) => {
                        const count = categoryMap.get(cat)?.length || 0
                        const isActive = !isSearching && cat === selectedCategory
                        return <button
                            key={cat}
                            type="button"
                            className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                            onClick={() => handleSelectCategory(cat)}
                        >
                            <Icon name={CATEGORY_ICONS[cat] || 'settings'} className={styles.navIcon} />
                            <span className={styles.navLabel}>{categoryLabel(TR, cat)}</span>
                            <span className={styles.navCount}>{count}</span>
                        </button>
                    })}
                    {categories.length === 0 && !loading && (
                        <p className={styles.navEmpty}>{TR('settings_empty_title')}</p>
                    )}
                </nav>

                {/* Mobile: matches replace the category list inside the search pane */}
                {isSearching && (
                    <div className={styles.navResults}>
                        <p className={styles.navResultsTitle}>{TR('settings_search_results', { count: searchMatches.length })}</p>
                        {searchMatches.length === 0
                            ? <p className={styles.navEmpty}>{TR('settings_search_empty')}</p>
                            : searchMatches.map((setting) => (
                                <button
                                    key={setting.id || setting.key}
                                    type="button"
                                    className={styles.navResult}
                                    onClick={() => handleSelectCategory(setting.category || 'general')}
                                >
                                    <span className={styles.navResultLabel}>{settingLabel(TR, setting)}</span>
                                    <span className={styles.navResultMeta}>{categoryLabel(TR, setting.category)}</span>
                                </button>
                            ))}
                    </div>
                )}

                <div className={styles.navFooter}>
                    <div className={styles.domainField}>
                        <span className={styles.domainLabel}>{TR('settings_domain')}</span>
                        <Select
                            options="domains"
                            value={selectedDomain}
                            onChange={handleDomainChange}
                            name="domainId"
                            placeholder={TR('settings_domain')}
                        />
                    </div>
                    <div className={styles.navActions}>
                        {canCreateSetting && (
                            <Button
                                className={styles.addBtn}
                                icon="add"
                                onClick={() => handleAddModal()}
                                tooltip={TR('settings_add')}
                            />
                        )}
                        <ContextMenu iconOnStart options={pageMenuOptions} />
                    </div>
                    <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleImportFile} style={{ display: 'none' }} />
                </div>
            </nav>

            <main className={styles.content}>
                <Button className={styles.backButton} icon="back" onClick={backToCategories}>
                    {TR('settings_back')}
                </Button>

                {isSearching ? (
                    <section className={styles.results}>
                        <div className={styles.contentHeader}>
                            <h2 className={styles.contentTitle}>{TR('settings_search_results', { count: searchMatches.length })}</h2>
                        </div>
                        {searchGroups.length === 0 ? (
                            <div className={styles.empty}>
                                <Icon name="search" className={styles.emptyIcon} />
                                <p className={styles.emptyTitle}>{TR('settings_search_empty')}</p>
                                <p className={styles.emptyHint}>{TR('settings_search_empty_hint')}</p>
                            </div>
                        ) : searchGroups.map(([cat, catSettings]) => (
                            <section key={cat} className={styles.group}>
                                <div className={styles.groupHeader}>
                                    <button type="button" className={styles.resultCatBtn} onClick={() => handleSelectCategory(cat)}>
                                        <Icon name={CATEGORY_ICONS[cat] || 'settings'} />
                                        {categoryLabel(TR, cat)}
                                        <span className={styles.navCount}>{catSettings.length}</span>
                                    </button>
                                </div>
                                <div className={styles.card}>
                                    {catSettings.map(renderSetting)}
                                </div>
                            </section>
                        ))}
                    </section>
                ) : selectedCategory ? (
                    <>
                        <div className={styles.contentHeader}>
                            <h2 className={styles.contentTitle}>{categoryLabel(TR, selectedCategory)}</h2>
                        </div>

                        {activeCategorySettings.length === 0 ? (
                            <div className={styles.empty}>
                                <Icon name="settings" className={styles.emptyIcon} />
                                <p className={styles.emptyTitle}>{TR('settings_empty_title')}</p>
                                <p className={styles.emptyHint}>{TR('settings_empty_hint')}</p>
                            </div>
                        ) : (
                            <div className={styles.card}>
                                {activeCategorySettings.map(renderSetting)}
                            </div>
                        )}
                    </>
                ) : loading ? (
                    <div className={styles.empty}>
                        <p className={styles.emptyHint}>{TR('settings_loading')}</p>
                    </div>
                ) : (
                    <div className={styles.empty}>
                        <Icon name="settings" className={styles.emptyIcon} />
                        <p className={styles.emptyTitle}>{TR('settings_empty_title')}</p>
                        <p className={styles.emptyHint}>{TR('settings_empty_hint')}</p>
                        {canCreateSetting && <Button icon="add" onClick={() => handleAddModal()}>{TR('settings_add')}</Button>}
                    </div>
                )}
            </main>
        </div>
    </div>
}
