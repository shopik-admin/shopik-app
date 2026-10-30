import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLists } from 'common/features/Lists'
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
import uid from 'common/functions/uid'
import styles from './orderSettings.module.css'

const LIMIT_FIELDS = ['minSum', 'minSumPickup', 'productMaxAmount']

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
        id: rule?.id || uid(8),
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

function snapshot(rules, limits) {
    return JSON.stringify({
        rules: (rules || []).map(toPayloadRule),
        limits: limitsToPayload(limits)
    })
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
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const [message, setMessage] = useState(null)
    const [previews, setPreviews] = useState({})
    const baselineRef = useRef('')

    const canEdit = isSuperAdmin || role?.permissions?.includes('setting:update')

    const applySettings = useCallback(data => {
        const nextRules = (data?.rules?.groups || []).map(toFormRule)
        const nextLimits = limitsToForm(data?.limits || {})
        setRules(nextRules)
        setLimits(nextLimits)
        setPreviews({})
        baselineRef.current = snapshot(nextRules, nextLimits)
    }, [])

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

    const dirty = snapshot(rules, limits) !== baselineRef.current

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
            id: uid(8),
            name: t('order_settings_new_rule_name'),
            enabled: true
        })])
        setMessage(null)
    }

    function removeRule(id) {
        setRules(prev => prev.filter(rule => rule.id !== id))
        setMessage(null)
    }

    async function previewRule(rule) {
        setPreviews(prev => ({ ...prev, [rule.id]: { loading: true } }))
        try {
            const res = await apiReq('order_setting/preview', { rule: toPayloadRule(rule) })
            setPreviews(prev => ({ ...prev, [rule.id]: { count: res?.count || 0, sample: res?.sample || [] } }))
        } catch (err) {
            setPreviews(prev => ({ ...prev, [rule.id]: { error: err?.message || t('order_settings_preview_failed') } }))
        }
    }

    async function handleSave() {
        if (!canEdit || !dirty || saving) return
        setSaving(true)
        setError(null)
        setMessage(null)
        try {
            const saved = await apiReq('order_setting/save', {
                domainId,
                rules: { groups: rules.map(toPayloadRule) },
                limits: limitsToPayload(limits)
            })
            applySettings(saved)
            setMessage(t('order_settings_saved'))
        } catch (err) {
            setError(err?.message || t('order_settings_save_failed'))
        } finally {
            setSaving(false)
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
                <Button
                    onClick={handleSave}
                    loading={saving}
                    disabled={loading || !canEdit || !dirty}
                    tooltip={!canEdit ? t('order_settings_save_permission') : undefined}
                >{t('order_settings_save')}</Button>
            </div>
        </div>

        {(error) && <div className={styles.error}>{error}</div>}
        {message && <div className={styles.message}>{message}</div>}
        {!canEdit && <div className={styles.notice}>{t('order_settings_view_only')}</div>}

        <Card title={t('order_settings_limits_title')}>
            <Text size="s" className={styles.muted}>{t('order_settings_limits_subtitle')}</Text>
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
                <Text size="s" className={styles.muted}>{t('order_settings_rules_subtitle')}</Text>
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
                            {t('order_settings_preview_count', { count: previews[rule.id].count })}
                            {previews[rule.id].sample?.length
                                ? ` · ${previews[rule.id].sample.slice(0, 4).map(product => product.name).join(', ')}`
                                : ''}
                        </Text>}
                    </div>
                </div>)}

                <div>
                    <Button icon="add" onClick={addRule} disabled={!canEdit}>{t('order_settings_add_rule')}</Button>
                </div>
            </Flex>
        </Card>
    </div>
}
