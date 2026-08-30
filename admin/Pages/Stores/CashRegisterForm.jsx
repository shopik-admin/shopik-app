import { useState, useEffect } from 'react'
import apiReq from 'common/functions/apiReq'
import useApi from 'common/functions/useApi'
import Input from 'common/components/Input'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import Loader from 'common/components/Loader'
import Form from 'common/components/Form'
import styles from './cashRegisterForm.module.css'

export default function CashRegisterForm({ storeId }) {
    const { data, loading, callReq } = useApi('cash_register/read', { filter: { storeId }, limit: 1 }, { hold: true })
    const existing = Array.isArray(data) ? data[0] : null
    const [syncState, setSyncState] = useState({})
    const [key, setKey] = useState(0)

    useEffect(() => { callReq() }, [storeId])
    useEffect(() => { if (data !== undefined) setKey(k => k + 1) }, [existing?.id])

    async function handleSubmit(vals) {
        const payload = {
            storeId,
            active: vals.active === 'on' || vals.active === true || vals.active === 'true',
            data: { StoreID: vals.StoreID || undefined }
        }
        if (vals.active === undefined) payload.active = existing ? existing.active : true
        if (existing?.id) await apiReq('cash_register/update', { id: existing.id, ...payload })
        else await apiReq('cash_register/create', payload)
        callReq()
    }

    async function handleSync() {
        setSyncState({ loading: true })
        try {
            const res = await apiReq('cash_register/sync', { storeId })
            setSyncState({ success: `סונכרן: ${res?.updated ?? 0} מוצרים` })
        } catch (e) {
            setSyncState({ error: e?.message || 'שגיאת סנכרון' })
        } finally {
            setSyncState(s => ({ ...s, loading: false }))
        }
    }

    if (loading) return <Flex justifyContent='center' style={{ padding: 24 }}><Loader /></Flex>

    return <Flex col gap={16} style={{ minWidth: 360 }}>
        <Form key={key} className={styles.form} onChange={() => setSyncState({})} action={handleSubmit} submitText='שמור'>
            <Input name='StoreID' label='StoreID (Comax)' defaultValue={existing?.data?.StoreID || ''} />
            <Input name='active' label='פעיל' type='switch' defaultValue={existing ? existing.active : false} />
        </Form>
        {syncState.error && <div style={{ color: 'var(--danger, #c00)', fontSize: 13, textAlign: 'center' }}>{syncState.error}</div>}
        {syncState.success && <div style={{ color: 'var(--success, #0a0)', fontSize: 13, textAlign: 'center' }}>{syncState.success}</div>}
    </Flex>
}
