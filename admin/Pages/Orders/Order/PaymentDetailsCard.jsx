import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import render from 'common/functions/render'
import { useText } from 'common/texts/TextProvider'
import styles from './order.module.css'

function SumRow({ label, value, bold, className }) {
    return <Flex justifyContent='space-between' gap={10} className={className}>
        <Text size='l' bold>{label}</Text>
        <Text size='l' bold={bold}>{value}</Text>
    </Flex>
}

export default function PaymentDetailsCard({ order }) {
    const { TR } = useText()
    const coin = value => render({ type: 'coin', value })
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
                {payment.last4digits && <SumRow label={'card'} value={`**** ${payment.last4digits}`} />}
                {expiry && <SumRow label={'card_expiry'} value={expiry} />}
                {payment.authCode && <SumRow label={'auth_code'} value={payment.authCode} />}
                {payment.authorizedAmount != null && <SumRow label={'authorized_amount'} value={coin(payment.authorizedAmount)} />}
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
                <SumRow label={'total_to_pay'} value={coin(order.finalSumWithShipping ?? order.finalSum ?? order.sum)} bold className={styles.totalRow} />
            </Flex>
        </Flex>
    </Card>
}
