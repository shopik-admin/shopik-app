import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLists } from 'common/features/Lists'
import { useUser } from 'features/User'
import Button from 'common/components/Button'
import Card from 'common/components/Card'
import Checkbox from 'common/components/Checkbox'
import Flex from 'common/components/Flex'
import Image from 'common/components/Image'
import Input from 'common/components/Input'
import Select from 'common/components/Select'
import Text from 'common/components/Text'
import { useText } from 'common/texts/TextProvider'
import apiReq from 'common/functions/apiReq'
import { getProductImageUrl } from 'common/functions/productImageUrl'
import styles from './orderSettings.module.css'

const LIMIT_FIELDS = ['minSum', 'minSumPickup', 'productMaxAmount']

// Client-safe rule id (common/functions/uid uses node:crypto and must not be
// bundled for the browser). Uniqueness within the edited list is all we need —
// the server keeps the id as the usage key and falls back when it is missing.
function newRuleId() {
    return `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function splitList(text) {
    if (Array.isArray(text)) return [...new Set(text.map(v => String(v).trim()).filter(Boolean))]
    return [...new Set(String(text || '').split(/[\s,;]+/).map(v => v.trim()).filter(Boolean))]
}

function numberOrZero(value) {
    const num = Number(value)
    return Number.isFinite(num) && num > 0 ? num : 0
}

function toFormRule(rule) {
    return {
        id: rule?.id || newRuleId(),
        name: rule?.name || '',
        enabled: rule?.enabled !== false,
        categoryIds: Array.isArray(rule?.categoryIds) ? rule.categoryIds : [],
        barcodes: (rule?.barcodes || []).join('\n'),
        excludeBarcodes: (rule?.excludeBarcodes || []).join('\n'),
        maxAmount: rule?.maxAmount ? String(rule.maxAmount) : '',
        step: rule?.step ? String(rule.step) : '',
        minAmount: rule?.minAmount ? String(rule.minAmount) : ''
    }
}

function toPayloadRule(rule) {
    return {
        id: rule.id,
        name: String(rule.name || '').trim(),
        enabled: rule.enabled !== false,
        categoryIds: rule.categoryIds || [],
        barcodes: splitList(rule.barcodes),
        excludeBarcodes: splitList(rule.excludeBarcodes),
        maxAmount: numberOrZero(rule.maxAmount),
        step: numberOrZero(rule.step),
        minAmount: numberOrZero(rule.minAmount)
    }
}

function limitsToForm(limits) {
    const out = {}
    for (const field of LIMIT_FIELDS)
        out[field] = limits?.[field] ? String(limits[field]) : ''
    return out
}

function limitsToPayload(limits) {
    const out = {}
    for (const field of LIMIT_FIELDS)
        out[field] = numberOrZero(limits?.[field])
    return out
}

function snapshotRules(rules) {
    return JSON.stringify((rules || []).map(toPayloadRule))
}

function snapshotLimits(limits) {
    return JSON.stringify(limitsToPayload(limits))
}

export default function OrderSettings() {
    const { domains = [] } = useLists() || {}
    const { isSuperAdmin, role } = useUser() || {}
    const { TR } = useText() || {}
    const t = useCallback((key, params) => TR?.(key, params) || key, [TR])

    const [domainId, setDomainId] = useState('')
    const [categories, setCategories] = useState([])
    const [rules, setRules] = useState([])
    const [limits, setLimits] = useState(() => limitsToForm({}))
    const [loading, setLoading] = useState(true)
    const [savingLimits, setSavingLimits] = useState(false)
    const [savingRules, setSavingRules] = useState(false)
    const [error, setError] = useState(null)
    const [message, setMessage] = useState(null)
    const [previews, setPreviews] = useState({})
    // Independent baselines: each card saves its own section, so a pending
    // edit in one card must not be wiped (or marked saved) by the other.
    const rulesBaselineRef = useRef('')
    const limitsBaselineRef = useRef('')

    const canEdit = isSuperAdmin || role?.permissions?.includes('setting:update')

    const applyRules = useCallback(data => {
        const nextRules = (data?.rules?.groups || []).map(toFormRule)
        setRules(nextRules)
        setPreviews({})
        rulesBaselineRef.current = snapshotRules(nextRules)
    }, [])

    const applyLimits = useCallback(data => {
        const nextLimits = limitsToForm(data?.limits || {})
        setLimits(nextLimits)
        limitsBaselineRef.current = snapshotLimits(nextLimits)
    }, [])

    const applySettings = useCallback(data => {
        applyRules(data)
        applyLimits(data)
    }, [applyRules, applyLimits])

    const load = useCallback(async id => {
        setLoading(true)
        setError(null)
        try {
            const data = await apiReq('order_setting/read', id ? { domainId: id } : {})
            applySettings(data)
        } catch (err) {
            setError(err?.message || t('order_settings_load_failed'))
        } finally {
            setLoading(false)
        }
    }, [applySettings, t])

    useEffect(() => {
        apiReq('order_setting/categories').then(list => setCategories(Array.isArray(list) ? list : [])).catch(() => { })
    }, [])

    useEffect(() => {
        if (!domainId && domains.length) {
            const def = domains.find(domain => domain?.isDefault)
            const first = def ?? domains[0]
            setDomainId(first?.value ?? first ?? '')
        }
    }, [domains, domainId])

    useEffect(() => {
        if (domainId) load(domainId)
        // No domains configured: still show the global rules instead of an
        // endless spinner. Limits are skipped (they are per domain).
        else if (domains.length === 0) load('')
    }, [domainId, domains, load])

    const categoryOptions = useMemo(() => {
        const options = categories.map(category => ({
            value: category.id,
            text: category.path || category.name || category.id
        }))
        const known = new Set(options.map(option => option.value))
        const extra = new Set()
        for (const rule of rules)
            for (const id of rule.categoryIds || [])
                if (!known.has(id)) extra.add(id)
        for (const id of extra)
            options.push({ value: id, text: id })
        return options
    }, [categories, rules])

    const rulesDirty = snapshotRules(rules) !== rulesBaselineRef.current
    const limitsDirty = snapshotLimits(limits) !== limitsBaselineRef.current

    function updateRule(id, patch) {
        setRules(prev => prev.map(rule => rule.id === id ? { ...rule, ...patch } : rule))
        setMessage(null)
        setPreviews(prev => {
            if (!prev[id]) return prev
            const next = { ...prev }
            delete next[id]
            return next
        })
    }

    function addRule() {
        setRules(prev => [...prev, toFormRule({
            id: newRuleId(),
            name: t('order_settings_new_rule_name'),
            enabled: true
        })])
        setMessage(null)
    }

    function removeRule(id) {
        setRules(prev => prev.filter(rule => rule.id !== id))
        setMessage(null)
    }

    async function previewRule(rule, { append = false } = {}) {
        const skip = append ? (previews[rule.id]?.products?.length || 0) : 0
        setPreviews(prev => ({
            ...prev,
            [rule.id]: append
                ? { ...prev[rule.id], loadingMore: true, error: null }
                : { loading: true }
        }))
        try {
            const res = await apiReq('order_setting/preview', { rule: toPayloadRule(rule), skip })
            setPreviews(prev => {
                const current = prev[rule.id] || {}
                const products = append
                    ? [...(current.products || []), ...(res?.products || [])]
                    : (res?.products || [])
                return {
                    ...prev,
                    [rule.id]: {
                        count: res?.count || 0,
                        products,
                        hasMore: !!res?.hasMore
                    }
                }
            })
        } catch (err) {
            setPreviews(prev => ({
                ...prev,
                [rule.id]: {
                    ...prev[rule.id],
                    loading: false,
                    loadingMore: false,
                    error: err?.message || t('order_settings_preview_failed')
                }
            }))
        }
    }

    async function saveLimits() {
        if (!canEdit || !limitsDirty || savingLimits) return
        setSavingLimits(true)
        setError(null)
        setMessage(null)
        try {
            // Limits only: the server leaves the global rules untouched.
            const saved = await apiReq('order_setting/save', {
                domainId,
                limits: limitsToPayload(limits)
            })
            applyLimits(saved)
            setMessage(t('order_settings_saved'))
        } catch (err) {
            setError(err?.message || t('order_settings_save_failed'))
        } finally {
            setSavingLimits(false)
        }
    }

    async function saveRules() {
        if (!canEdit || !rulesDirty || savingRules) return
        setSavingRules(true)
        setError(null)
        setMessage(null)
        try {
            // Rules only: domain limits (including keys this page does not
            // edit) stay as they are.
            const saved = await apiReq('order_setting/save', {
                domainId,
                rules: { groups: rules.map(toPayloadRule) }
            })
            applyRules(saved)
            setMessage(t('order_settings_saved'))
        } catch (err) {
            setError(err?.message || t('order_settings_save_failed'))
        } finally {
            setSavingRules(false)
        }
    }

    return <div className={styles.page}>
        <div className={styles.header}>
            <div>
                <Text size="h2" tag="h1" bold>{t('order_settings_title')}</Text>
                <Text className={styles.muted}>{t('order_settings_subtitle')}</Text>
            </div>
            <div className={styles.actions}>
                <Select
                    options="domains"
                    value={domainId}
                    onChange={event => {
                        setDomainId(event.target.value)
                        setMessage(null)
                        setError(null)
                    }}
                    className={styles.domainSelect}
                />
            </div>
        </div>

        {(error) && <div className={styles.error}>{error}</div>}
        {message && <div className={styles.message}>{message}</div>}
        {!canEdit && <div className={styles.notice}>{t('order_settings_view_only')}</div>}

        <Card title={t('order_settings_limits_title')}>
            <div className={styles.cardBar}>
                <Text size="s" className={styles.muted}>{t('order_settings_limits_subtitle')}</Text>
                {limitsDirty && <Button
                    size="s"
                    onClick={saveLimits}
                    loading={savingLimits}
                    disabled={loading || !canEdit}
                    tooltip={!canEdit ? t('order_settings_save_permission') : undefined}
                >{t('order_settings_save')}</Button>}
            </div>
            <div className={styles.grid}>
                <Input
                    name={t('order_settings_min_sum')}
                    type="number"
                    min="0"
                    value={limits.minSum}
                    onChange={event => setLimits(prev => ({ ...prev, minSum: event.target.value }))}
                    disabled={!canEdit}
                />
                <Input
                    name={t('order_settings_min_sum_pickup')}
                    type="number"
                    min="0"
                    value={limits.minSumPickup}
                    onChange={event => setLimits(prev => ({ ...prev, minSumPickup: event.target.value }))}
                    disabled={!canEdit}
                />
                <Input
                    name={t('order_settings_product_max')}
                    type="number"
                    min="0"
                    value={limits.productMaxAmount}
                    onChange={event => setLimits(prev => ({ ...prev, productMaxAmount: event.target.value }))}
                    disabled={!canEdit}
                />
            </div>
        </Card>

        <Card title={t('order_settings_rules_title')}>
            <Flex col gap={8}>
                <div className={styles.cardBar}>
                    <Text size="s" className={styles.muted}>{t('order_settings_rules_subtitle')}</Text>
                    {rulesDirty && <Button
                        size="s"
                        onClick={saveRules}
                        loading={savingRules}
                        disabled={loading || !canEdit}
                        tooltip={!canEdit ? t('order_settings_save_permission') : undefined}
                    >{t('order_settings_save')}</Button>}
                </div>
                {rules.length === 0 && <Text className={styles.muted}>{t('order_settings_no_rules')}</Text>}
                {rules.map(rule => <div key={rule.id} className={styles.rule}>
                    <div className={styles.ruleHeader}>
                        <Input
                            name={t('order_settings_rule_name')}
                            value={rule.name}
                            onChange={event => updateRule(rule.id, { name: event.target.value })}
                            disabled={!canEdit}
                            className={styles.ruleName}
                        />
                        <Checkbox
                            className={styles.ruleToggle}
                            label={t('order_settings_rule_enabled')}
                            switchMode
                            checked={rule.enabled}
                            onChange={event => canEdit && updateRule(rule.id, { enabled: !!event.target.checked })}
                        />
                        <Button
                            mode="text"
                            icon="trash"
                            tooltip={t('order_settings_remove_rule')}
                            onClick={() => removeRule(rule.id)}
                            disabled={!canEdit}
                        />
                    </div>

                    <div className={styles.grid}>
                        <Input
                            name={t('order_settings_rule_max')}
                            type="number"
                            min="0"
                            info={t('order_settings_rule_max_hint')}
                            value={rule.maxAmount}
                            onChange={event => updateRule(rule.id, { maxAmount: event.target.value })}
                            disabled={!canEdit}
                        />
                        <Input
                            name={t('order_settings_rule_step')}
                            type="number"
                            min="0"
                            step="any"
                            info={t('order_settings_rule_step_hint')}
                            value={rule.step}
                            onChange={event => updateRule(rule.id, { step: event.target.value })}
                            disabled={!canEdit}
                        />
                        <Input
                            name={t('order_settings_rule_min')}
                            type="number"
                            min="0"
                            step="any"
                            info={t('order_settings_rule_min_hint')}
                            value={rule.minAmount}
                            onChange={event => updateRule(rule.id, { minAmount: event.target.value })}
                            disabled={!canEdit}
                        />
                    </div>

                    <div className={styles.ruleTargets}>
                        <div className={styles.targetField}>
                            <Text size="s" bold>{t('order_settings_rule_categories')}</Text>
                            <Select
                                options={categoryOptions}
                                value={rule.categoryIds}
                                multi
                                noTabs
                                disabled={!canEdit}
                                placeholder={t('order_settings_rule_categories_placeholder')}
                                onChange={event => updateRule(rule.id, {
                                    categoryIds: Array.from(event.target.selectedOptions || []).map(option => option.value)
                                })}
                            />
                        </div>
                        <Input
                            name={t('order_settings_rule_barcodes')}
                            type="textarea"
                            rows={3}
                            info={t('order_settings_rule_barcodes_hint')}
                            value={rule.barcodes}
                            onChange={event => updateRule(rule.id, { barcodes: event.target.value })}
                            disabled={!canEdit}
                            className={styles.targetField}
                        />
                        <Input
                            name={t('order_settings_rule_exclude_barcodes')}
                            type="textarea"
                            rows={3}
                            info={t('order_settings_rule_exclude_barcodes_hint')}
                            value={rule.excludeBarcodes}
                            onChange={event => updateRule(rule.id, { excludeBarcodes: event.target.value })}
                            disabled={!canEdit}
                            className={styles.targetField}
                        />
                    </div>

                    <div className={styles.ruleFooter}>
                        <Button mode="text" icon="search" onClick={() => previewRule(rule)}>
                            {t('order_settings_rule_preview')}
                        </Button>
                        {previews[rule.id]?.loading && <Text size="s" className={styles.muted}>{t('order_settings_preview_loading')}</Text>}
                        {previews[rule.id]?.error && <Text size="s" mode="error">{previews[rule.id].error}</Text>}
                        {previews[rule.id]?.count != null && <Text size="s" className={styles.muted}>
                            {previews[rule.id].products?.length
                                ? t('order_settings_preview_showing', {
                                    shown: previews[rule.id].products.length,
                                    count: previews[rule.id].count
                                })
                                : t('order_settings_preview_count', { count: previews[rule.id].count })}
                        </Text>}
                    </div>

                    {previews[rule.id]?.products?.length > 0 && <div className={styles.previewPanel}>
                        <div className={styles.previewGrid}>
                            {previews[rule.id].products.map(product => <div key={product.id} className={styles.previewCard}>
                                <Image
                                    src={getProductImageUrl(product.id, 'm')}
                                    className={styles.previewImage}
                                    alt={product.name}
                                />
                                <div className={styles.previewDetails}>
                                    <Text size="l" bold className={styles.previewName} ellipsis={2}>{product.name}</Text>
                                    <Text size="m" className={styles.previewBarcode}>{product.barcode}</Text>
                                    <div className={styles.previewMatchRow}>
                                        <Text size="m" className={styles.previewMatch} ellipsis={1} title={product.match?.path}>
                                            {product.match?.level === 'barcode'
                                                ? t('order_settings_preview_matched_barcode')
                                                : t('order_settings_preview_matched_category', { name: product.match?.name })}
                                        </Text>
                                        {product.match?.level !== 'barcode' && <CopyValueButton
                                            text={product.match?.path}
                                            title={t('order_settings_copy_category_path')}
                                        />}
                                    </div>
                                </div>
                            </div>)}
                        </div>
                        {previews[rule.id].hasMore && <div className={styles.previewMore}>
                            <Button
                                size="s"
                                mode="text"
                                icon="add"
                                loading={previews[rule.id].loadingMore}
                                onClick={() => previewRule(rule, { append: true })}
                            >{t('order_settings_preview_more')}</Button>
                        </div>}
                    </div>}
                </div>)}

                <div>
                    <Button icon="add" onClick={addRule} disabled={!canEdit}>{t('order_settings_add_rule')}</Button>
                </div>
            </Flex>
        </Card>
    </div>
}

function CopyValueButton({ text, title }) {
    const { TR } = useText() || {}
    const [copied, setCopied] = useState(false)

    async function copy(e) {
        e.preventDefault()
        e.stopPropagation()
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text)
            } else {
                // Plain-http admin has no clipboard API
                const area = document.createElement('textarea')
                area.value = text
                document.body.appendChild(area)
                area.select()
                document.execCommand('copy')
                area.remove()
            }
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch {
            setCopied(false)
        }
    }

    return <Button
        mode="text"
        icon={copied ? 'check' : 'copy'}
        tooltip={copied ? (TR?.('order_settings_copied') || title) : title}
        onClick={copy}
    />
}
