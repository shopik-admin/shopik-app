import { useEffect, useMemo, useRef, useState } from 'react'
import apiReq from 'common/functions/apiReq'
import useApi from 'common/functions/useApi'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import Form from 'common/components/Form'
import Input from 'common/components/Input'
import Loader from 'common/components/Loader'
import Select from 'common/components/Select'
import Text from 'common/components/Text'
import styles from './salesWindow.module.css'

const MAX_DAYS = 365
const DAYS_ERROR = 'comax_sales_window_days_invalid'
const RULE_EMPTY_ERROR = 'comax_sales_window_rule_empty'

function toDays(raw, errorKey) {
    const text = String(raw ?? '').trim()
    const days = Number(text)
    if (text === '' || !Number.isInteger(days) || days < 0 || days > MAX_DAYS) throw errorKey
    return days
}

/**
 * Sale windows for the Comax import.
 *
 * One modal for the whole config: a default window plus per-department
 * overrides. `0` disables the filter for that window. A department may appear
 * in one rule only — that is enforced here in the picker and again on the
 * server, which owns the final word.
 */
export default function SalesWindowModal({ onClose }) {
    const { data, loading, error: loadError } = useApi('comax_product/sales_window')
    const [defaultDays, setDefaultDays] = useState('30')
    const [rules, setRules] = useState([])
    const [saving, setSaving] = useState(false)
    const nextId = useRef(1)

    useEffect(() => {
        if (!data) return
        setDefaultDays(String(data.defaultDays ?? 30))
        setRules((data.rules || []).map(rule => ({
            id: nextId.current++,
            days: String(rule.days),
            departments: [...(rule.departments || [])]
        })))
    }, [data])

    // Department → rule id, so a code already used by another rule is disabled
    // in this one instead of being silently moved.
    const usedBy = useMemo(() => {
        const map = new Map()
        for (const rule of rules) for (const code of rule.departments) map.set(code, rule.id)
        return map
    }, [rules])

    function departmentOptions(ruleId) {
        return (data?.departments || []).map(d => ({
            value: d.code,
            text: d.name ? `${d.name} (${d.code})` : d.code,
            disabled: usedBy.has(d.code) && usedBy.get(d.code) !== ruleId
        }))
    }

    function updateRule(id, patch) {
        setRules(prev => prev.map(rule => rule.id === id ? { ...rule, ...patch } : rule))
    }

    function addRule() {
        setRules(prev => [...prev, { id: nextId.current++, days: '30', departments: [] }])
    }

    function removeRule(id) {
        setRules(prev => prev.filter(rule => rule.id !== id))
    }

    async function handleAction() {
        const payload = {
            defaultDays: toDays(defaultDays, DAYS_ERROR),
            rules: rules.map(rule => {
                if (!rule.departments.length) throw RULE_EMPTY_ERROR
                return {
                    days: toDays(rule.days, DAYS_ERROR),
                    departments: rule.departments
                }
            })
        }

        setSaving(true)
        try {
            await apiReq('comax_product/sales_window_update', payload)
            onClose?.()
        } finally {
            setSaving(false)
        }
    }

    if (loading && !data)
        return <Flex center style={{ padding: 32 }}><Loader /></Flex>

    if (loadError)
        return <Text mode="error">{loadError?.message || String(loadError)}</Text>

    return <Form action={handleAction} loading={saving} submitText="save">
        <Flex col gap={14}>
            <Input
                label="comax_sales_window_default_days"
                type="number"
                min={0}
                max={MAX_DAYS}
                value={defaultDays}
                onChange={e => setDefaultDays(e.target.value)}
                info="comax_sales_window_null_hint"
            />

            <Flex col gap={8}>
                <Text bold size="s">comax_sales_window_rules</Text>
                {!rules.length && <Text size="s" mode="sub">comax_sales_window_no_rules</Text>}

                {rules.map(rule => (
                    <div key={rule.id} className={styles.rule}>
                        <Select
                            multiple
                            value={rule.departments}
                            placeholder="comax_sales_window_departments"
                            onChange={e => updateRule(rule.id, { departments: e.target.value })}
                            options={departmentOptions(rule.id)}
                            className={styles.departments}
                        />
                        <Flex gap={8} alignItems="center">
                            <Input
                                label="comax_sales_window_days"
                                type="number"
                                min={0}
                                max={MAX_DAYS}
                                value={rule.days}
                                onChange={e => updateRule(rule.id, { days: e.target.value })}
                                className={styles.days}
                            />
                            <Button
                                type="button"
                                mode="outline"
                                icon="trash"
                                tooltip="comax_sales_window_remove_rule"
                                onClick={() => removeRule(rule.id)}
                            />
                        </Flex>
                    </div>
                ))}

                <Flex>
                    <Button type="button" mode="outline" icon="add" onClick={addRule}>
                        comax_sales_window_add_rule
                    </Button>
                </Flex>
            </Flex>

            <Text size="s" mode="sub">comax_sales_window_hint</Text>
        </Flex>
    </Form>
}
