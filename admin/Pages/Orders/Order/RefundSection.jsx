import { useMemo, useState } from 'react'
import apiReq from 'common/functions/apiReq'
import render from 'common/functions/render'
import {
    REFUND_EPS,
    getRemaining,
    isLineRefundable,
    lineMaxRefundable,
    lineAvailableQty,
    suggestRefundForQty,
    shippingRemaining,
    round2,
} from 'common/functions/refundCalc'
import { useText } from 'common/texts/TextProvider'
import { ProductImage } from 'common/components/Product'
import Button from 'common/components/Button'
import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import classNames from 'common/functions/classNames'
import styles from './order.module.css'

const coin = value => render({ type: 'coin', value })

function lineKey(line, i) {
    return String(line.id || line.barcode || i)
}

// View-only refund sum for a line: qty controls everything, the amount is
// derived most-expensive-unit-first and can never be hand-edited.
function rowAmount(line, order, qty) {
    if (!(qty > 0)) return 0
    return Math.min(suggestRefundForQty(line, qty), lineMaxRefundable(line, order))
}

export default function RefundSection({ order, onDone, onExit }) {
    const { TR } = useText()
    const cart = order.cart || []
    const [qtys, setQtys] = useState({})
    const [ship, setShip] = useState(0)
    const [reason, setReason] = useState('')
    const [pending, setPending] = useState(false)
    const [error, setError] = useState('')

    const remaining = getRemaining(order)
    const maxShip = shippingRemaining(order)

    const { itemsTotal, total, shipOver, over } = useMemo(() => {
        let sum = 0
        for (let i = 0; i < cart.length; i++) {
            sum = round2(sum + rowAmount(cart[i], order, Number(qtys[lineKey(cart[i], i)] || 0)))
        }
        const shipAmt = round2(Number(ship || 0))
        const shipBad = shipAmt - maxShip > REFUND_EPS || shipAmt < 0
        const tot = round2(sum + shipAmt)
        return {
            itemsTotal: sum,
            total: tot,
            shipOver: shipBad,
            over: tot - remaining > REFUND_EPS,
        }
    }, [qtys, ship, cart, order, remaining, maxShip])

    function onQty(line, i, rawQty) {
        const avail = lineAvailableQty(line)
        const qty = Math.min(Math.max(0, Number(rawQty || 0)), avail)
        setQtys(prev => ({ ...prev, [lineKey(line, i)]: qty }))
    }

    async function confirm() {
        setPending(true)
        setError('')
        try {
            const items = []
            for (let i = 0; i < cart.length; i++) {
                const line = cart[i]
                const amt = rowAmount(line, order, Number(qtys[lineKey(line, i)] || 0))
                if (amt > 0) items.push({ productId: String(line.id || line.barcode), amount: amt })
            }
            const shipAmt = round2(Number(ship || 0))
            await apiReq('payment/refund', {
                orderId: order.id,
                items,
                shippingAmount: shipAmt,
                reason: reason.trim() || undefined,
            })
            await onDone?.()
        } catch (e) {
            setError(e?.message || 'refund_failed')
        } finally {
            setPending(false)
        }
    }

    const canConfirm = total > 0 && !over && !shipOver && !pending

    return <Card className={styles.refundCard}>
        <Flex col gap={10}>
            <Flex gap={8} alignItems='center' justifyContent='space-between'>
                <Text size='h3' bold>{'refund_title'}</Text>
                <Button mode='text' onClick={onExit}>{'refund_exit'}</Button>
            </Flex>
            <Text size='s' mode='sub'>{TR('refund_remaining_hint')}: {coin(remaining)}</Text>
            <Flex col gap={10}>
                {cart.map((line, i) => {
                    const key = lineKey(line, i)
                    const refundable = isLineRefundable(line, order)
                    const max = refundable ? lineMaxRefundable(line, order) : 0
                    const avail = lineAvailableQty(line)
                    const refunded = Number(line.refundedAmount || 0)
                    const qty = Number(qtys[key] || 0)
                    const amount = refundable ? rowAmount(line, order, qty) : 0
                    const step = Number(line.unit?.step || 1)
                    const minusDisabled = qty <= 0
                    const plusDisabled = qty >= avail || (max > 0 && amount >= max - REFUND_EPS)
                    return <Flex key={key} gap={10} className={classNames(styles.refundRow, [styles.refundRowDisabled, !refundable])}>
                        <ProductImage product={line} size='s' hideSaleBadge />
                        <Flex col gap={6} grow={1}>
                            <Flex gap={8} alignItems='center' justifyContent='space-between'>
                                <Text size='m' bold ellipsis={1}>{line.name || line.barcode}</Text>
                                <Text size='s' mode='sub'>{coin(line.totalSum)} · {TR('refund_max')}: {coin(max)}</Text>
                            </Flex>
                            {line.barcode && <Flex alignItems='center' gap={4}>
                                <Icon name='barcode' size={12} />
                                <Text size='s' mode='sub'>{line.barcode}</Text>
                            </Flex>}
                            {!refundable
                                ? <Text size='s' mode='error' bold>refund_not_supplied</Text>
                                : <>
                                    {refunded > 0 && <Text size='s' mode='sub'>{TR('refunded')}: {coin(refunded)}</Text>}
                                    <Flex gap={8} alignItems='center' wrap>
                                        <Flex gap={4} alignItems='center' className={styles.qtyStepper}>
                                            <button type='button' className={styles.stepBtn} disabled={minusDisabled} onClick={() => onQty(line, i, qty - step)} aria-label='minus'>-</button>
                                            <input
                                                type='number' min={0} max={avail} step={step}
                                                value={qty}
                                                onChange={e => onQty(line, i, e.target.value)}
                                                className={styles.qtyInput}
                                                aria-label='refund_qty'
                                            />
                                            <button type='button' className={styles.stepBtn} disabled={plusDisabled} onClick={() => onQty(line, i, qty + step)} aria-label='plus'>+</button>
                                        </Flex>
                                        <span className={styles.amountView}>{coin(amount)}</span>
                                    </Flex>
                                </>}
                        </Flex>
                    </Flex>
                })}
            </Flex>
            <Flex gap={8} alignItems='center' justifyContent='space-between' className={styles.refundRow}>
                <Text size='m' bold>{'refund_shipping'}</Text>
                <input
                    type='number' min={0} max={maxShip} step={0.01}
                    value={ship}
                    onChange={e => setShip(Number(e.target.value || 0))}
                    className={shipOver ? styles.amountInputBad : styles.amountInput}
                    aria-label='refund_shipping'
                />
            </Flex>
            <Text size='s' mode='sub'>{TR('refund_shipping_max')}: {coin(maxShip)}</Text>
            <textarea
                className={styles.reasonInput}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={TR('refund_reason_placeholder') || 'refund_reason_placeholder'}
                rows={2}
            />
            <Flex gap={8} alignItems='center' justifyContent='space-between' className={styles.totalBar}>
                <Text size='l' bold>{coin(total)} / {coin(remaining)}</Text>
                <Text size='s' mode='sub'>{TR('refund_items_total')}: {coin(itemsTotal)}</Text>
            </Flex>
            {over && <Text size='s' mode='error'>{'refund_exceeds_remaining'}</Text>}
            {error ? <Text size='s' mode='error'>{error}</Text> : null}
            <Flex gap={8}>
                <Button mode='outline' onClick={onExit}>cancel</Button>
                <Button onClick={confirm} loading={pending} disabled={!canConfirm}>refund_confirm</Button>
            </Flex>
        </Flex>
    </Card>
}
