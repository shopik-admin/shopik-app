import { useState } from 'react'
import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Button from 'common/components/Button'
import Popover from 'common/components/Popover'
import apiReq from 'common/functions/apiReq'
import render from 'common/functions/render'
import { getRemaining } from 'common/functions/refundCalc'
import { useText } from 'common/texts/TextProvider'
import styles from './order.module.css'

function SumRow({ label, value, bold, className }) {
    return <Flex justifyContent='space-between' gap={10} className={className}>
        <Text size='l' bold>{label}</Text>
        <Text size='l' bold={bold}>{value}</Text>
    </Flex>
}

export default function PaymentDetailsCard({ order, onChanged }) {
    const { TR } = useText()
    const coin = value => render({ type: 'coin', value })
    const [manualAmt, setManualAmt] = useState(0)
    const [manualBusy, setManualBusy] = useState(false)
    const [manualError, setManualError] = useState('')
    const pending = Number(order.refundPending || 0)
    const payment = order.payment || {}
    // provider sends the expiry as YYMM
    const expiry = /^\d{4}$/.test(payment.cardExpiry || '')
        ? `${payment.cardExpiry.slice(2)}/${payment.cardExpiry.slice(0, 2)}`
        : payment.cardExpiry

    return <Card className={styles.detailsCard}>
        <Text size='h3' bold className={styles.cardTitle}>{'payment_details'}</Text>
        <Flex col gap={22}>
            <Flex col gap={16}>
                {payment.provider && <SumRow label={'payment_provider'} value={payment.provider} />}
                {payment.cardCompany && <SumRow label={'card_company'} value={payment.cardCompany} />}
                {payment.last4digits && <SumRow label={'card'} value={<bdi>****{payment.last4digits}</bdi>} />}
                {expiry && <SumRow label={'card_expiry'} value={expiry} />}
                {payment.captureProviderTxnId && <SumRow label={'transaction_id'} value={payment.captureProviderTxnId} />}
                {payment.capturedAt && <SumRow label={'captured_at'} value={render({ type: 'datetime', value: payment.capturedAt })} />}
            </Flex>
            <Flex col gap={16} className={styles.sumsSection}>
                <SumRow label={'items_count'} value={String((order.cart || []).length)} />
                {(order.coupons || []).length > 0 && (order.sumNoCoupon ?? order.sum) != null && <SumRow label={'sum_before_coupon'} value={coin(order.sumNoCoupon ?? order.sum)} />}
                {(order.coupons || []).map(coupon => <SumRow
                    key={coupon.code}
                    label={`${TR('coupon_discount')} ${coupon.code || ''}`}
                    value={`-${coin(coupon.appliedDiscount ?? coupon.discount)}`}
                />)}
                {order.sum != null && <SumRow label={'sum'} value={coin((order.coupons || []).length > 0 ? (order.finalSum ?? order.sum) : order.sum)} />}
                {(order.finalShipping ?? order.shipping) != null && <SumRow label={'shipping_cost'} value={coin(order.finalShipping ?? order.shipping)} />}
                {order.refundedTotal > 0 && <SumRow label={'refunded'} value={coin(order.refundedTotal)} />}
                {order.refundedShipping > 0 && <SumRow label={'refunded_shipping'} value={coin(order.refundedShipping)} />}
                {order.paid && <SumRow label={'refund_remaining'} value={coin(getRemaining(order))} />}
                {pending > 0 && <SumRow label={'refund_pending'} value={coin(pending)} />}
                {pending > 0 && !order.manualRequired && <Text size='s' mode='sub' style={{ lineHeight: '18px' }}>{'refund_auto_retry_note'}</Text>}
                {order.manualRequired && <Popover
                    button={<Button mode='outline' permission='order:payment'>{TR('register_manual_refund')}</Button>}
                >
                    {({ close }) => <Flex col gap={10} className={styles.cancelPopover}>
                        <Text size='s' mode='sub'>{'manual_refund_hint'}</Text>
                        <input
                            type='number' min={0} max={pending} step={0.01}
                            value={manualAmt}
                            onChange={e => setManualAmt(Number(e.target.value || 0))}
                            className={styles.amountInput}
                            aria-label='manual_refund_amount'
                        />
                        {manualError ? <Text size='s' mode='error'>{manualError}</Text> : null}
                        <Flex gap={8}>
                            <Button mode='outline' onClick={() => { setManualError(''); close() }}>{'cancel'}</Button>
                            <Button
                                externalLoading={manualBusy}
                                disabled={!(manualAmt > 0) || manualAmt - pending > 0.001}
                                onClick={async () => {
                                    setManualBusy(true)
                                    setManualError('')
                                    try {
                                        await apiReq('payment/refund', { orderId: order.id, manual: true, amount: manualAmt })
                                        setManualAmt(0)
                                        close()
                                        await onChanged?.()
                                    } catch (e) {
                                        setManualError(e?.message || 'refund_failed')
                                    } finally {
                                        setManualBusy(false)
                                    }
                                }}
                            >{'manual_refund_confirm'}</Button>
                        </Flex>
                    </Flex>}
                </Popover>}
                <SumRow label={'total_to_pay'} value={coin(order.finalSumWithShipping ?? order.finalSum ?? order.sum)} bold className={styles.totalRow} />
            </Flex>
        </Flex>
    </Card>
}
