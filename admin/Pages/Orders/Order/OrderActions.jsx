import { useState } from 'react'
import apiReq from 'common/functions/apiReq'
import render from 'common/functions/render'
import { getRemaining } from 'common/functions/refundCalc'
import { useText } from 'common/texts/TextProvider'
import usePermission from 'common/permissions/usePermision'
import Button from 'common/components/Button'
import Card from 'common/components/Card'
import Popover from 'common/components/Popover'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import styles from './order.module.css'
import classNames from '#common/functions/classNames.js'

export default function OrderActions({ order, refundMode, onToggleRefund, onChanged }) {
    const { TR } = useText()
    const canPay = usePermission('order:payment')
    const [reason, setReason] = useState('')
    const [pending, setPending] = useState(false)
    const [error, setError] = useState('')
    const coin = value => render({ type: 'coin', value })

    const isCanceled = order.status === 'canceled'
    const isFailed = order.status === 'failed'
    const canCancel = !isCanceled
    const remaining = getRemaining(order)
    const canRefund = Boolean(order.paid && order.payment?.captureProviderTxnId)
        && remaining > 0.001 && !isCanceled && !isFailed

    async function confirmCancel(close) {
        setPending(true)
        setError('')
        try {
            await apiReq('payment/cancel', { orderId: order.id, reason: reason.trim() || undefined })
            setReason('')
            close?.()
            await onChanged?.()
        } catch (e) {
            setError(e?.message || 'cancel_failed')
        } finally {
            setPending(false)
        }
    }

    return <Flex col gap={10}>
        <Flex gap={8} wrap className={styles.actionsBar}>
            {canCancel && canPay && <Popover
                button={<Button mode='outline' className={styles.actionBtn}>{TR('cancel_order')}</Button>}
            >
                {({ close }) => <Flex col gap={10} className={styles.cancelPopover}>
                    <Text size='h3' bold>{'cancel_order_confirm_title'}</Text>
                    <Text size='s' mode='sub'>{order.paid ? 'cancel_order_captured_hint' : 'cancel_order_hold_hint'}</Text>
                    <textarea
                        className={styles.reasonInput}
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder={TR('cancel_reason_placeholder') || 'cancel_reason_placeholder'}
                        rows={2}
                    />
                    {error ? <Text size='s' mode='error'>{error}</Text> : null}
                    <Flex gap={8}>
                        <Button mode='outline' onClick={() => { setError(''); close() }}>{'cancel'}</Button>
                        <Button onClick={() => confirmCancel(close)} externalLoading={pending}>{'confirm'}</Button>
                    </Flex>
                </Flex>}
            </Popover>}
            {canRefund && <Button
                mode='outline'
                permission='order:payment'
                onClick={onToggleRefund}
                className={classNames(styles.actionBtn, refundMode && styles.refundActive)}
            >
                {TR('refund')}
            </Button>}
        </Flex>
        {order.manualRequired && <Card className={styles.pendingCard}>
            <Flex col gap={4}>
                <Text size='s' bold>{TR('refund_manual_required')}</Text>
                <Text size='s'>{TR('cancel_refund_pending_hint')}: {coin(order.refundPending)}</Text>
            </Flex>
        </Card>}
    </Flex>
}
