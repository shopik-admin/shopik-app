import { useMemo, useState } from 'react'
import apiReq from 'common/functions/apiReq'
import render from 'common/functions/render'
import {
    REFUND_EPS,
    capRefundProducts,
    getRemaining,
    isLineRefundable,
    lineMaxRefundable,
    lineAvailableQty,
    productRefundRemaining,
    suggestRefundForQty,
    shippingRemaining,
    round2,
} from 'common/functions/refundCalc'
import { DEFAULT_REFUND_REASONS, REFUND_REASON_OTHER } from 'common/constants/refundReasons'
import { useText } from 'common/texts/TextProvider'
import { ProductImage } from 'common/components/Product'
import Button from 'common/components/Button'
import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import Select from 'common/components/Select'
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
    const [general, setGeneral] = useState(0)
    const [generalReason, setGeneralReason] = useState('')
    const [generalReasonText, setGeneralReasonText] = useState('')
    const [ship, setShip] = useState(0)
    const [reason, setReason] = useState('')
    const [pending, setPending] = useState(false)
    const [error, setError] = useState('')

    const remaining = getRemaining(order)
    const maxShip = shippingRemaining(order)
    const productRemaining = productRefundRemaining(order)

    const {
        itemAmounts, itemsTotal, productsCapped, maxGeneral, generalAmt, total, shipOver, generalOver, over,
    } = useMemo(() => {
        const requested = []
        for (let i = 0; i < cart.length; i++) {
            const line = cart[i]
            const amount = rowAmount(line, order, Number(qtys[lineKey(line, i)] || 0))
            if (amount > 0) {
                requested.push({ key: lineKey(line, i), productId: String(line.id || line.barcode), amount })
            }
        }
        // A prior general refund shrinks the product pool; cap the selected
        // lines to whatever is still available.
        const capped = capRefundProducts(order, requested, 0)
        const amounts = new Map(capped.items.map(it => [String(it.key), Number(it.amount || 0)]))
        const requestedTotal = round2(requested.reduce((acc, it) => acc + it.amount, 0))
        const sum = round2(capped.items.reduce((acc, it) => acc + it.amount, 0))
        const generalAmt = round2(Number(general || 0))
        const genMax = Math.max(0, round2(productRemaining - sum))
        const shipAmt = round2(Number(ship || 0))
        const shipBad = shipAmt - maxShip > REFUND_EPS || shipAmt < 0
        const genBad = generalAmt - genMax > REFUND_EPS || generalAmt < 0
        const tot = round2(sum + shipAmt + generalAmt)
        return {
            itemAmounts: amounts,
            itemsTotal: sum,
            productsCapped: requestedTotal - sum > REFUND_EPS,
            maxGeneral: genMax,
            generalAmt,
            total: tot,
            shipOver: shipBad,
            generalOver: genBad,
            over: tot - remaining > REFUND_EPS,
        }
    }, [qtys, ship, general, cart, order, remaining, maxShip, productRemaining])

    const reasons = Array.isArray(order.refundReasons) ? order.refundReasons : DEFAULT_REFUND_REASONS
    const allowOther = order.refundAllowOther !== false
    const reasonOptions = [
        ...reasons.filter(Boolean),
        ...(allowOther ? [{ value: REFUND_REASON_OTHER, text: 'refund_reason_other' }] : []),
    ]
    const showGeneralReason = generalAmt > 0 && reasonOptions.length > 0
    const generalReasonValue = generalReason === REFUND_REASON_OTHER ? generalReasonText.trim() : generalReason
    const reasonMissing = showGeneralReason && !generalReasonValue

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
                const amt = Number(itemAmounts.get(lineKey(line, i)) || 0)
                if (amt > 0) items.push({ productId: String(line.id || line.barcode), amount: amt })
            }
            const shipAmt = round2(Number(ship || 0))
            const reasonText = showGeneralReason ? generalReasonValue : reason.trim()
            await apiReq('payment/refund', {
                orderId: order.id,
                items,
                shippingAmount: shipAmt,
                generalAmount: generalAmt,
                reason: reasonText || undefined,
            })
            await onDone?.()
        } catch (e) {
            setError(e?.message || 'refund_failed')
        } finally {
            setPending(false)
        }
    }

    const canConfirm = total > 0 && !over && !shipOver && !generalOver && !reasonMissing && !pending

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
                    const amount = refundable ? Number(itemAmounts.get(key) || 0) : 0
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
            {productsCapped && <Text size='s' mode='sub'>{'refund_products_capped'}</Text>}
            <Flex gap={8} alignItems='center' justifyContent='space-between' className={styles.refundRow}>
                <Text size='m' bold>{'refund_general'}</Text>
                <input
                    type='number' min={0} max={maxGeneral} step={0.01}
                    value={general}
                    onChange={e => setGeneral(Number(e.target.value || 0))}
                    className={generalOver ? styles.amountInputBad : styles.amountInput}
                    aria-label='refund_general'
                />
            </Flex>
            <Text size='s' mode='sub'>{TR('refund_general_max')}: {coin(maxGeneral)}</Text>
            {showGeneralReason && <Flex col gap={6}>
                <Text size='m' bold>{'refund_reason'}</Text>
                <Select
                    options={reasonOptions}
                    value={generalReason}
                    onChange={e => setGeneralReason(e.target.value)}
                    placeholder={TR('refund_reason_choose')}
                />
                {generalReason === REFUND_REASON_OTHER && <input
                    type='text'
                    className={styles.reasonInput}
                    value={generalReasonText}
                    onChange={e => setGeneralReasonText(e.target.value)}
                    placeholder={TR('refund_reason_other_placeholder')}
                />}
                {reasonMissing && <Text size='s' mode='error'>{'refund_reason_required'}</Text>}
            </Flex>}
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
            {!showGeneralReason && <textarea
                className={styles.reasonInput}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={TR('refund_reason_placeholder') || 'refund_reason_placeholder'}
                rows={2}
            />}
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
