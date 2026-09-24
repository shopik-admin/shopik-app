import { useState } from 'react'
import { useUser } from 'features/User'
import { useLists } from 'common/features/Lists'
import { useText } from 'common/texts/TextProvider'
import { useModal } from 'common/components/Modal'
import { useData } from 'features/DataManager/DataProvider'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Select from 'common/components/Select'

// Floating current-store pill (same look as the view-toggle pill), rendered in
// every ops view. Only visible when the admin can see 2+ stores; opens the
// store modal and refreshes the queue in place (no reload).
export default function StorePill() {
    const { currentStoreId } = useUser()
    const lists = useLists()
    const { openModal, closeModal } = useModal()
    const { callReq } = useData()
    const { TR } = useText?.() || {}
    const stores = lists?.stores || []
    if (stores.length < 2) return null
    const current = currentStoreId ? String(currentStoreId) : ''
    const name = stores.find(s => String(s.value ?? s) === current)?.text ?? current
    return <Button
        mode='outline'
        icon='stores'
        onClick={() => openModal(
            <StorePickerModal onDone={() => { closeModal(); callReq() }} />,
            { title: TR?.('ops_select_store') ?? 'ops_select_store' }
        )}
    >{name}</Button>
}

function StorePickerModal({ onDone }) {
    const { currentStoreId, setCurrentStore } = useUser()
    const lists = useLists()
    const { TR } = useText?.() || {}
    const [chosen, setChosen] = useState(currentStoreId ? String(currentStoreId) : '')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const stores = lists?.stores || []

    async function confirm() {
        if (!chosen || saving) return
        setSaving(true)
        setError('')
        try {
            await setCurrentStore(chosen)
            onDone?.()
        } catch (e) {
            setError(e?.message || 'ops_store_set_failed')
        } finally {
            setSaving(false)
        }
    }

    return <Flex col gap={12} style={{ minWidth: 240 }}>
        <Select
            value={chosen}
            onChange={e => setChosen(e.target.value)}
            options={stores}
            placeholder={TR?.('select_store') ?? 'select store'}
        />
        {error && <Text size="s" mode="error" center>{error}</Text>}
        <Button loading={saving} disabled={!chosen} onClick={confirm}>
            {TR?.('ops_confirm_store') ?? 'ops_confirm_store'}
        </Button>
    </Flex>
}
