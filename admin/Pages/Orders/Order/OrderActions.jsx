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
    const isCart = order.status === 'cart'
    const canCancel = !isCanceled && !isCart
    const remaining = getRemaining(order)
    const canRefund = Boolean(order.paid && order.payment?.captureProviderTxnId)
        && remaining > 0.001 && !isCanceled && !isFailed && !isCart
    const canInvoice = Boolean(order.paid && order.payment?.captureProviderTxnId)
        && ['packed', 'shipped', 'done', 'canceled'].includes(order.status)
        && !order.paymentVoided
    const [invoiceBusy, setInvoiceBusy] = useState(false)
    const [invoiceError, setInvoiceError] = useState('')

    async function openInvoice() {
        setInvoiceBusy(true)
        setInvoiceError('')
        try {
            const res = await apiReq('payment/invoice', { orderId: order.id })
            if (res?.url) window.open(res.url, '_blank', 'noopener')
            else setInvoiceError('invoice_failed')
        } catch (e) {
            setInvoiceError(e?.message || 'invoice_failed')
        } finally {
            setInvoiceBusy(false)
        }
    }

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
                button={<Button mode='outline' className={styles.actionBtn}>cancel_order</Button>}
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
                        <Button onClick={() => confirmCancel(close)} loading={pending}>{'confirm'}</Button>
                    </Flex>
                </Flex>}
            </Popover>}
            {canRefund && <Button
                mode='outline'
                permission='order:payment'
                onClick={onToggleRefund}
                className={classNames(styles.actionBtn, refundMode && styles.refundActive)}
            >
                {'refund'}
            </Button>}
            {canInvoice && <Button
                mode='outline'
                icon='invoice'
                permission='order:payment'
                onClick={openInvoice}
                loading={invoiceBusy}
                className={styles.actionBtn}
            >
                invoice_link
            </Button>}
        </Flex>
        {invoiceError ? <Text size='s' mode='error'>{invoiceError}</Text> : null}
        {order.manualRequired && <Card className={styles.pendingCard}>
            <Flex col gap={4}>
                <Text size='s' bold>{TR('refund_manual_required')}</Text>
                <Text size='s'>{TR('cancel_refund_pending_hint')}: {coin(order.refundPending)}</Text>
            </Flex>
        </Card>}
    </Flex>
}
