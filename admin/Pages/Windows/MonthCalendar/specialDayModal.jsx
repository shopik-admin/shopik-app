import { useEffect, useMemo, useState } from 'react'
import apiReq from 'common/functions/apiReq'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import Input from 'common/components/Input'
import Text from 'common/components/Text'
import { useText } from 'common/texts/TextProvider'
import { formatHourRange, formatHour } from '../dates.js'
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
    const [name, setName] = useState(special?.name || '')
    const [allStores, setAllStores] = useState(!special?.storeId)
    const [storeId, setStoreId] = useState(!allStores ? special?.storeId : stores[0]?.id)
    const [fullDay, setFullDay] = useState(special?.start == null)
    const [start, setStart] = useState(special?.start ?? 10)
    const [end, setEnd] = useState(special?.end ?? 16)
    const [error, setError] = useState(null)
    const [saving, setSaving] = useState(false)

    const previewWindows = useMemo(() => {
        // representative template windows to illustrate the closure effect
        const sample = [[8, 10], [10, 12], [12, 14], [14, 16], [16, 18], [18, 20]]
        const sd = fullDay ? { start: null, end: null } : { start, end }
        const closed = sample.filter(w =>
            sd.start == null || (w[0] < sd.end && w[1] > sd.start))
        const open = sample.filter(w => !closed.includes(w))
        return { closed, open }
    }, [fullDay, start, end])

    async function save() {
        if (!name.trim()) {
            setError('windows_name_required')
            return
        }
        setSaving(true)
        setError(null)
        try {
            const payload = {
                name,
                date: special?.date || date,
                ...(allStores ? {} : { storeId })
            }
            if (!fullDay) {
                payload.start = Number(start)
                payload.end = Number(end)
            }
            if (special) {
                await apiReq('special_day/update', { id: special.id, ...payload })
                onDone?.('windows_updated')
            } else {
                await apiReq('special_day/create', payload)
                onDone?.('windows_created')
            }
            onClose()
        } catch (e) {
            setError(toMessage(e))
        } finally {
            setSaving(false)
        }
    }

    async function remove() {
        if (!window.confirm(`${TR('windows_delete_special_confirm')} "${name}"?${special?.source === 'hebcal' ? ` (${TR('windows_hebcal_restore_note')})` : ''}`))
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

    return <Flex col gap={10}>
        <Input
            label="name"
            name="name"
            required
            defaultValue={name}
            onChange={e => setName(e.target.value)}
        />

        <div className={styles.scopeRow}>
            <Text size="s">windows_scope</Text>
            <Flex gap={4}>
                <button type="button" className={allStores ? styles.toggleOn : styles.toggle} onClick={() => setAllStores(true)}><Text size="none">windows_all_stores_toggle</Text></button>
                <button type="button" className={!allStores ? styles.toggleOn : styles.toggle} onClick={() => setAllStores(false)}><Text size="none">windows_specific_store</Text></button>
            </Flex>
            {!allStores && (
                <select
                    className={styles.select}
                    value={storeId}
                    onChange={e => setStoreId(e.target.value)}
                >
                    {(stores || []).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
            )}
        </div>

        <div className={styles.scopeRow}>
            <Text size="s">type</Text>
            <Flex gap={4}>
                <button type="button" className={fullDay ? styles.toggleOn : styles.toggle} onClick={() => setFullDay(true)}><Text size="none">windows_full_day</Text></button>
                <button type="button" className={!fullDay ? styles.toggleOn : styles.toggle} onClick={() => setFullDay(false)}><Text size="none">windows_hours</Text></button>
            </Flex>
        </div>

        {!fullDay && (
            <Flex gap={8} alignItems="center">
                <select className={styles.select} value={start} onChange={e => setStart(Number(e.target.value))}>
                    {HOURS.map(h => <option key={h.value} value={h.value}>{h.text}</option>)}
                </select>
                <span><Text size="none">windows_until</Text></span>
                <select className={styles.select} value={end} onChange={e => setEnd(Number(e.target.value))}>
                    {HOURS.slice(1).map(h => <option key={h.value} value={h.value}>{h.text}</option>)}
                </select>
            </Flex>
        )}

        <Text size="s" mode="sub">
            {fullDay
                ? TR('windows_full_day_preview')
                : `${TR('windows_preview_closed')} ${previewWindows.closed.map(w => formatHourRange(...w)).join(', ') || '—'} ${TR('windows_preview_close_suffix')} ${previewWindows.open.map(w => formatHourRange(...w)).join(', ') || '—'} ${TR('windows_preview_open_suffix')}`}
        </Text>

        {error && <div className={styles.errorBox}><Text size="none">{TR(error)}</Text></div>}

        <Flex gap={8} justifyContent="end">
            {special && (
                <Button mode="outline" icon="trash" onClick={remove} disabled={saving}>delete</Button>
            )}
            <Button mode="outline" onClick={onClose} disabled={saving}>cancel</Button>
            <Button onClick={save} loading={saving}>{special ? 'save' : 'windows_create'}</Button>
        </Flex>
    </Flex>
}
