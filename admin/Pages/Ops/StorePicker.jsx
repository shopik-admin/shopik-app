import { useState } from 'react'
import { useUser } from 'features/User'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Select from 'common/components/Select'

// "Pick one of your stores" control, shared by the ops entry gate and the
// floating store pill. Sets the admin's currentStoreId via admin/current_store,
// then hands control back to the caller (onDone) to refresh the queue.
export default function StorePicker({ onDone }) {
    const { currentStoreId, setCurrentStore } = useUser()
    const [chosen, setChosen] = useState(currentStoreId ? String(currentStoreId) : '')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

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
            options='stores'
            placeholder='select_store'
        />
        {error && <Text size="s" mode="error" center>{error}</Text>}
        <Button loading={saving} disabled={!chosen} onClick={confirm}>ops_confirm_store</Button>
    </Flex>
}
