import { useMemo, useState } from 'react'
import apiReq from 'common/functions/apiReq'
import Button from 'common/components/Button'
import Checkbox from 'common/components/Checkbox'
import Flex from 'common/components/Flex'
import Form from 'common/components/Form'
import Input from 'common/components/Input'
import Text from 'common/components/Text'
import { useText } from 'common/texts/TextProvider'
import { formatHourRange } from '../dates.js'
import styles from './month.module.css'

const HOURS = Array.from({ length: 24 }, (_, h) => ({
    value: h,
    text: `${String(h).padStart(2, '0')}:00`
}))

const toMessage = err => typeof err === 'string' ? err : err?.message || 'something went wrong'

/**
 * Create / edit modal for a special day.
 * `special` = existing doc for edit, or null for create.
 * `date`    = prefilled date (create).
 */
export default function SpecialDayModal({ special, date, stores = [], onDone, onClose }) {
    const { TR } = useText()
    const [storeIds, setStoreIds] = useState(() => {
        if (special?.storeIds?.length) return [...special.storeIds]
        return []
    })
    const [fullDay, setFullDay] = useState(special ? special?.start == null : true)
    const [start, setStart] = useState(special?.start ?? 10)
    const [end, setEnd] = useState(special?.end ?? 16)
    const [error, setError] = useState(null)
    const [saving, setSaving] = useState(false)

    const previewWindows = useMemo(() => {
        const sample = [[8, 10], [10, 12], [12, 14], [14, 16], [16, 18], [18, 20]]
        const sd = fullDay ? { start: null, end: null } : { start, end }
        const closed = sample.filter(w =>
            sd.start == null || (w[0] < sd.end && w[1] > sd.start))
        const open = sample.filter(w => !closed.includes(w))
        return { closed, open }
    }, [fullDay, start, end])

    async function handleAction(vals) {
        const name = vals.name?.trim() ?? ''
        if (!name) throw 'windows_name_required'

        const payload = {
            name,
            date: special?.date || date,
            storeIds: storeIds.length ? storeIds : [],
            start: fullDay ? null : Number(vals.start ?? start),
            end: fullDay ? null : Number(vals.end ?? end),
        }
        if (fullDay) {
            payload.start = null
            payload.end = null
        }

        setSaving(true)
        setError(null)
        try {
            if (special) {
                await apiReq('special_day/update', { id: special.id, ...payload })
                onDone?.('windows_updated')
            } else {
                await apiReq('special_day/create', payload)
                onDone?.('windows_created')
            }
            onClose()
        } catch (e) {
            const msg = toMessage(e)
            setError(msg)
            throw msg
        } finally {
            setSaving(false)
        }
    }

    async function remove() {
        if (!window.confirm(`${TR('windows_delete_special_confirm')} "${special?.name}"?${special?.source === 'hebcal' ? ` (${TR('windows_hebcal_restore_note')})` : ''}`))
            return
        setSaving(true)
        try {
            await apiReq('special_day/delete', { id: special.id })
            onClose()
            onDone?.('windows_deleted')
        } catch (e) {
            setError(toMessage(e))
        } finally {
            setSaving(false)
        }
    }

    return <Form
        action={handleAction}
        error={error}
        loading={saving}
        noSubmit
        onChange={() => setError(null)}
    >
        <Flex col gap={10}>
            <Input
                label="name"
                name="name"
                required
                defaultValue={special?.name || ''}
            />

            <div className={styles.scopeRow}>
                <Text size="s">stores</Text>
                <select
                    className={styles.select}
                    name="storeIds"
                    multiple
                    size={Math.min(6, Math.max(3, stores.length + 1))}
                    value={storeIds.length ? storeIds : ['_all']}
                    onChange={e => {
                        const selected = Array.from(e.target.selectedOptions).map(o => o.value)
                        if (selected.includes('_all')) {
                            const withoutAll = selected.filter(v => v !== '_all')
                            setStoreIds(storeIds.length === 0 && withoutAll.length ? withoutAll : [])
                        } else {
                            setStoreIds(selected)
                        }
                    }}
                    style={{ minWidth: '200px', height: 'auto' }}
                >
                    <option value="_all">{TR('windows_all_stores') || 'All stores'}</option>
                    {(stores || []).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
            </div>

            <Checkbox
                name="fullDay"
                checked={fullDay}
                onChange={e => setFullDay(e.target.checked)}
            >
                <Text size="s">windows_full_day</Text>
            </Checkbox>

            <Flex gap={8} alignItems="center">
                <select
                    className={styles.select}
                    name="start"
                    value={fullDay ? '' : start}
                    onChange={e => setStart(Number(e.target.value))}
                    disabled={fullDay}
                >
                    {fullDay && <option value="">-</option>}
                    {!fullDay && HOURS.map(h => <option key={h.value} value={h.value}>{h.text}</option>)}
                </select>
                <span><Text size="none">windows_until</Text></span>
                <select
                    className={styles.select}
                    name="end"
                    value={fullDay ? '' : end}
                    onChange={e => setEnd(Number(e.target.value))}
                    disabled={fullDay}
                >
                    {fullDay && <option value="">-</option>}
                    {!fullDay && HOURS.slice(1).map(h => <option key={h.value} value={h.value}>{h.text}</option>)}
                </select>
            </Flex>

            <Text size="s" mode="sub">
                {fullDay
                    ? TR('windows_full_day_preview')
                    : <Flex col gap={8} style={{ textWrap: 'auto', maxWidth: '240px' }}>
                        <span>
                            {TR('windows_preview_closed')}: {previewWindows.closed.map(w => formatHourRange(...w)).join(', ') || '—'}
                        </span>
                        <span>
                            {TR('windows_preview_open')}: {previewWindows.open.map(w => formatHourRange(...w)).join(', ') || '—'}
                        </span>
                    </Flex>}
            </Text>

            <Flex gap={8} justifyContent="end" style={{ marginTop: 8 }}>
                {special && (
                    <Button mode="outline" icon="trash" onClick={remove} disabled={saving} type="button">delete</Button>
                )}
                <Button mode="outline" onClick={onClose} disabled={saving} type="button">cancel</Button>
                <Button type="submit" loading={saving}>{special ? 'save' : 'windows_create'}</Button>
            </Flex>
        </Flex>
    </Form>
}
