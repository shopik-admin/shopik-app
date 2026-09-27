import { useState } from 'react'
import { useLists } from 'common/features/Lists'
import Select from 'common/components/Select'
import Text from 'common/components/Text'
import Flex from 'common/components/Flex'

// Custom DataManager form field (used as `type: defaults => <StoreFields defaults={defaults} />`):
// multi-select for allowed stores + current-store dropdown limited to the selected
// stores. Values serialize through the Selects' own hidden inputs (storeIds as a JSON
// array, currentStoreId as a single input) and are picked up by Form.getValues.
export default function StoreFields({ defaults }) {
    const stores = useLists()?.stores || []
    const [storeIds, setStoreIds] = useState(() => (defaults?.storeIds || []).map(String))
    const [currentStoreId, setCurrentStoreId] = useState(() => String(defaults?.currentStoreId || ''))
    const currentOptions = stores.filter(s => storeIds.includes(String(s.value)))

    function onStoresChange(e) {
        const selected = e.target.value
        setStoreIds(selected)
        if (currentStoreId && !selected.includes(currentStoreId)) setCurrentStoreId('')
    }

    return <Flex col gap={10}>
        <Text size="s">storeIds</Text>
        <Select name="storeIds" multiple options='stores' value={storeIds} onChange={onStoresChange} />

        <Text size="s">currentStoreId</Text>
        <Select
            name="currentStoreId"
            value={currentStoreId}
            onChange={e => setCurrentStoreId(e.target.value)}
            options={currentOptions}
            placeholder='select_store'
            disabled={!currentOptions.length}
        />
    </Flex>
}
