import { useUser } from 'features/User'
import { useLists } from 'common/features/Lists'
import { useModal } from 'common/components/Modal'
import { useData } from 'features/DataManager/DataProvider'
import Button from 'common/components/Button'
import StorePicker from './StorePicker'

// Floating current-store pill (same look as the view-toggle pill), rendered in
// every ops view. Only visible when the admin can see 2+ stores; opens the store
// picker and refreshes the queue in place (no reload).
export default function StorePill() {
    const { currentStoreId } = useUser()
    const { openModal, closeModal } = useModal()
    const { callReq } = useData()
    const stores = useLists()?.stores || []
    if (stores.length < 2) return null
    const name = stores.find(s => String(s.value) === String(currentStoreId))?.text ?? currentStoreId
    return <Button
        mode='outline'
        icon='stores'
        onClick={() => openModal(
            <StorePicker onDone={() => { closeModal(); callReq() }} />,
            { title: 'ops_select_store' }
        )}
    >{name}</Button>
}
