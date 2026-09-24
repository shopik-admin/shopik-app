import { useState } from 'react'
import { useLists } from 'common/features/Lists'
import { useText } from 'common/texts/TextProvider'
import Select from 'common/components/Select'
import Text from 'common/components/Text'
import Flex from 'common/components/Flex'

// Custom DataManager form field (used as `type: defaults => <StoreFields defaults={defaults} />`):
// multi-select for allowed stores + current-store dropdown limited to the selected stores.
// Values serialize through the Selects' own hidden inputs (storeIds as a JSON array,
// currentStoreId as a single input) and are picked up by Form.getValues.
export default function StoreFields({ defaults }) {
    const lists = useLists()
    const { TR } = useText?.() || {}
    const stores = lists?.stores || []

    const [storeIds, setStoreIds] = useState(() => (defaults?.storeIds || []).map(String))
    const [currentStoreId, setCurrentStoreId] = useState(() =>
        defaults?.currentStoreId ? String(defaults.currentStoreId) : '')

    const validStoreIds = storeIds.filter(id => stores.some(s => String(s.value ?? s) === id))
    const currentOptions = stores.filter(s => validStoreIds.includes(String(s.value ?? s)))

    function onStoresChange(e) {
        const selected = Array.from(e.target.selectedOptions || []).map(o => o.value)
        setStoreIds(selected)
        if (currentStoreId && !selected.includes(currentStoreId)) setCurrentStoreId('')
    }

    return <Flex col gap={10}>
        <Flex col gap={4}>
            <Text size="s">{TR?.('storeIds') ?? 'storeIds'}</Text>
            <Select
                name="storeIds"
                multiple
                value={storeIds}
                onChange={onStoresChange}
                options={stores}
                placeholder={TR?.('select_stores') ?? 'select stores'}
            />
        </Flex>
        <Flex col gap={4}>
            <Text size="s">{TR?.('currentStoreId') ?? 'currentStoreId'}</Text>
            <Select
                name="currentStoreId"
                value={currentStoreId}
                onChange={e => setCurrentStoreId(e.target.value)}
                options={currentOptions}
                disabled={!currentOptions.length}
                placeholder={TR?.('select_store') ?? 'select store'}
            />
        </Flex>
    </Flex>
}
