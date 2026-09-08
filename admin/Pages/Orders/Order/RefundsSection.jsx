import { useState } from 'react'
import useApi from 'common/functions/useApi'
import apiReq from 'common/functions/apiReq'
import render from 'common/functions/render'
import { round2 } from 'common/functions/calcOrder/utils'
import { useText } from 'common/texts/TextProvider'
import Button from 'common/components/Button'
import Card from 'common/components/Card'
import Collapse from 'common/components/Collapse'
import Flex from 'common/components/Flex'
import Loader from 'common/components/Loader'
import Text from 'common/components/Text'
import styles from './order.module.css'

const coin = value => render({ type: 'coin', value })
const datetime = value => render({ type: 'datetime', value })

function actorLabel(entry, TR) {
    return entry.actor?.name || TR(entry.actor?.role === 'user' ? 'actor_user' : 'actor_system')
}

function RefundRow({ entry, busyTxnId, onInvoice }) {
    const { TR } = useText()
    const context = entry.context || {}
    const allItems = Array.isArray(context.items) ? context.items : []
    const products = allItems.filter(i => i.productId !== '__shipping')
    const shipItem = allItems.find(i => i.productId === '__shipping')
    const shipAmount = Number(shipItem?.amount ?? context.shippingAmount ?? 0)
    const amount = Number(context.amount || 0)

    return <Collapse
        defaultOpen={false}
        title={<Flex gap={8} alignItems='center' wrap>
            <Text size='m' bold>{coin(amount)}</Text>
            {products.length > 0 && <Text size='m' mode='sub'>{products.length} {TR('items_suffix')}</Text>}
            <Text size='m' mode='sub'>{actorLabel(entry, TR)}</Text>
            {context.providerTxnId && <Button
                mode='outline' icon='invoice' permission='order:payment'
                loading={busyTxnId === context.providerTxnId}
                onClick={() => onInvoice(context.providerTxnId)}
                className={styles.invoiceBtn}
            >
                invoice_link
            </Button>}
        </Flex>}
    >
        <Flex col gap={6}>
            {products.map((item, i) => <Flex key={item.productId || i} gap={8} alignItems='center' justifyContent='space-between'>
                <Text size='m' ellipsis={1}>{item.name || item.barcode || item.productId}</Text>
                <Text size='m'>{coin(item.amount)}</Text>
            </Flex>)}
            {shipAmount > 0 && <Flex gap={8} alignItems='center' justifyContent='space-between'>
                <Text size='m'>{TR('refund_shipping')}</Text>
                <Text size='m'>{coin(shipAmount)}</Text>
            </Flex>}
            {context.reason && <Flex gap={8} alignItems='center' justifyContent='space-between'>
                <Text size='m' mode='sub'>{TR('refund_reason')}</Text>
                <Text size='m' mode='sub' ellipsis={1}>{context.reason}</Text>
            </Flex>}
            <Flex gap={8} alignItems='center' justifyContent='space-between'>
                <Text size='m' mode='sub'>{TR('transaction_id')}</Text>
                <Flex gap={4} alignItems='center'>
                    <Text size='m' mode='sub'>{context.providerTxnId || ''}</Text>
                </Flex>
            </Flex>
            <Flex gap={8} alignItems='center' justifyContent='space-between'>
                <Text size='m' mode='sub'>{actorLabel(entry, TR)}</Text>
                <Text size='m' mode='sub'>{datetime(entry.createdAt)}</Text>
            </Flex>
        </Flex>
    </Collapse>
}

export default function RefundsSection({ order }) {
    const { data, loading, error } = useApi('order/timeline', { orderId: order.id })
    const [busyTxnId, setBusyTxnId] = useState(null)
    if (loading) return <Loader />
    if (error || !data) return null

    const refunds = (data || []).filter(e => e.event?.type === 'refund' && e.outcome?.success !== false)
    if (refunds.length === 0) return null
    const total = round2(refunds.reduce((acc, e) => acc + Number(e.context?.amount || 0), 0))

    async function openInvoice(providerTxnId) {
        setBusyTxnId(providerTxnId)
        try {
            const res = await apiReq('payment/invoice', { orderId: order.id, providerTxnId })
            if (res?.url) window.open(res.url, '_blank', 'noopener')
        } catch (e) {
            console.error(e)
        } finally {
            setBusyTxnId(null)
        }
    }

    return <Card className={styles.productsCard}>
        <Flex gap={8} alignItems='center' className={styles.productsCardHeader}>
            <Text size='h3' bold className={styles.productsCardTitle}>refunds_title</Text>
            <Text size='m' bold className={styles.sumPill}>{coin(total)}</Text>
        </Flex>
        <Flex col gap={10}>
            {refunds.map((entry, i) => <RefundRow key={entry._id || i} entry={entry} busyTxnId={busyTxnId} onInvoice={openInvoice} />)}
        </Flex>
    </Card>
}
