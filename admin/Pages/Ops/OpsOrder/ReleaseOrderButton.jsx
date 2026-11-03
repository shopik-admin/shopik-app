import { useState } from 'react'
import apiReq from 'common/functions/apiReq'
import { useModal } from 'common/components/Modal'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'

// Confirmation + request wrapper for releasing a picking order back to the paid
// queue — either a manager releasing someone else's order or a picker releasing
// their own. Errors stay inside the dialog so the user can retry.
export default function ReleaseOrderButton({ orderId, q, label = 'ops_release_picker', onReleased, mode = 'outline' }) {
    const { openModal, closeModal } = useModal()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    async function submit() {
        if (loading) return
        setLoading(true)
        setError('')
        try {
            const res = await apiReq('order/ops/release', { id: orderId })
            closeModal()
            onReleased?.(res)
        } catch (e) {
            setError(e?.message || 'ops_release_failed')
        } finally {
            setLoading(false)
        }
    }

    function open() {
        setError('')
        openModal(
            <Flex col gap={20} center>
                <Text size='l' bold center>{q}</Text>
                {error ? <Text size='s' mode='error' center>{error}</Text> : null}
                <Flex gap={20} center>
                    <Button loading={loading} onClick={submit}>{'confirm'}</Button>
                    <Button mode='outline' disabled={loading} onClick={closeModal}>{'cancel'}</Button>
                </Flex>
            </Flex>,
            { title: 'ops_release_title' }
        )
    }

    return <Button mode={mode} icon='x' onClick={open}>{label}</Button>
}
