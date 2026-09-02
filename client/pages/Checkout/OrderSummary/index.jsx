import { useState, useMemo } from 'react'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Card from 'common/components/Card'
import Collapse from 'common/components/Collapse'
import Loader from 'common/components/Loader'
import render from '#common/functions/render.js'
import styles from './orderSummary.module.css'
import { useUser } from 'features/User'
import { useOrder } from 'features/Order/OrderProvider'
import { useAppData } from 'App'
import WindowOptions from 'features/Order/WindowOptions'
import Addresses, { AddressForm } from 'pages/Account/Addresses'
import { useText } from 'common/texts/TextProvider'
import { CouponCollapse } from './CouponSection'
import { calcShipping, extractShippingConfig } from '#common/functions/shipping.js'
import {
    LuMapPinHouse,
    LuClock,
    LuPencil,
    LuCreditCard
} from 'react-icons/lu'

export default function OrderSummary({ onPayment, paying, showPayBtn = true }) {
    const { order = {} } = useOrder()
    const { addresses = [] } = useUser()
    const { TR } = useText() || {}

    const [addressOpen, setAddressOpen] = useState(false)
    const [windowOpen, setWindowOpen] = useState(false)

    // Get active address from user state or order fallback
    const activeAddress = addresses.find(a => a.active) || addresses[0]
    const addressText = activeAddress
        ? `${activeAddress.street} ${activeAddress.building}${activeAddress.apartment ? ' דירה ' + activeAddress.apartment : ''}, ${activeAddress.city}`
        : (order.address || TR?.('address') || 'כתובת אספקה')

    // Get active window from order state
    const activeWindow = order.window
    const deliveryTimeText = activeWindow
        ? `${activeWindow.dayName || TR?.('day-2') || 'יום שלישי'}, ${activeWindow.start}:00-${activeWindow.end}:00`
        : (order.deliveryWindow || `${TR?.('day-2') || 'יום שלישי'}, 10:00-12:00`)

    // Real financial calculations from order
    const { settings } = useAppData() || {}
    const shippingConfig = useMemo(() => extractShippingConfig(settings), [settings])
    const cart = order.cart || []
    const subtotal = order.sum ?? order.subtotal ?? cart.reduce((acc, item) => acc + ((item.price || 0) * (item.amount || 1)), 0)
    const shipping = order.shipping ?? calcShipping({ sum: subtotal, deliveryMethod: order.deliveryMethod, shippingConfig })
    const originalShipping = order.deliveryMethod === 'pickup'
        ? Number(shippingConfig?.pickupTotal ?? shippingConfig?.total ?? 0)
        : Number(shippingConfig?.total ?? 0)
    const isFreeShipping = Number(shipping) === 0 && originalShipping > 0 && subtotal > 0
    const deliveryFee = shipping
    const hasCoupon = !!(order?.coupons && order.coupons.length)
    const totalSavings = (() => {
        const before = order.sumNoCoupon ?? order.sum ?? subtotal
        const after = hasCoupon ? (order.finalSum ?? order.sum ?? subtotal) : (order.sum ?? subtotal)
        return Math.max(0, Number(before || 0) - Number(after || 0))
    })()
    const total = hasCoupon && order.finalSumWithShipping != null
        ? order.finalSumWithShipping
        : (order.sumWithShipping ?? (subtotal + Number(shipping || 0)))

    return (
        <Flex col gap={15} className={styles.orderSummaryWrapper}>
            <Text size='xxl' bold className={styles.title}>
                order_summary_title
            </Text>

            <Card className={styles.summaryCard}>
                <Flex col>
                    {/* 1. Address Collapse Item */}
                    <Collapse
                        open={addressOpen}
                        onToggle={setAddressOpen}
                        showChevron={false}
                        className={styles.summaryCollapse}
                        title={
                            <Flex alignItems='center' justifyContent='space-between' width='100%'>
                                <Flex alignItems='center' gap={12}>
                                    <div className={styles.iconCircle}>
                                        <LuMapPinHouse className={styles.rowIcon} />
                                    </div>
                                    <Text bold size='m' className={styles.rowText}>
                                        {addressText}
                                    </Text>
                                </Flex>
                                <button
                                    type='button'
                                    className={styles.editBtn}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setAddressOpen(prev => !prev)
                                    }}
                                    aria-label={TR?.('edit_address')}
                                >
                                    <LuPencil />
                                </button>
                            </Flex>
                        }
                    >
                        <div className={styles.collapseContent}>
                            {addresses.length > 0 ? (
                                <Addresses action={{ onClick: () => setAddressOpen(false) }} />
                            ) : (
                                <AddressForm onDone={() => setAddressOpen(false)} />
                            )}
                        </div>
                    </Collapse>

                    {/* 2. Delivery Window Collapse Item */}
                    <Collapse
                        open={windowOpen}
                        onToggle={setWindowOpen}
                        showChevron={false}
                        className={styles.summaryCollapse}
                        title={
                            <Flex alignItems='center' justifyContent='space-between' width='100%'>
                                <Flex alignItems='center' gap={12}>
                                    <div className={styles.iconCircle}>
                                        <LuClock className={styles.rowIcon} />
                                    </div>
                                    <Text bold size='m' className={styles.rowText}>
                                        {deliveryTimeText}
                                    </Text>
                                </Flex>
                                <button
                                    type='button'
                                    className={styles.editBtn}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setWindowOpen(prev => !prev)
                                    }}
                                    aria-label={TR?.('edit_delivery_time')}
                                >
                                    <LuPencil />
                                </button>
                            </Flex>
                        }
                    >
                        <div className={styles.collapseContent}>
                            {windowOpen && <WindowOptions />}
                        </div>
                    </Collapse>

                    {/* 3. Coupon Collapse Item — only shown if user/coupon returns relevant coupons */}
                    <CouponCollapse defaultOpen={true} />

                    {/* Financial Breakdown */}
                    <Flex col gap={8} className={styles.breakdown}>
                        <Flex alignItems='center' justifyContent='space-between' className={styles.subtotalRow}>
                            <Text mode='sub' size='m'>
                                subtotal_text
                            </Text>
                            <Text size='m' bold>
                                {render({ type: 'coin', value: subtotal })}
                            </Text>
                        </Flex>

                        <Flex alignItems='center' justifyContent='space-between' className={styles.subtotalRow}>
                            <Text mode='sub' size='m'>
                                handling_and_delivery
                            </Text>
                            {isFreeShipping ? (
                                <Flex gap={6} alignItems='center'>
                                    <Text size='m' bold style={{ textDecoration: 'line-through', opacity: 0.6 }}>{render({ type: 'coin', value: originalShipping })}</Text>
                                    <Text size='m' bold>free_shipping</Text>
                                </Flex>
                            ) : (
                                <Text size='m' bold>
                                    {render({ type: 'coin', value: deliveryFee })}
                                </Text>
                            )}
                        </Flex>

                        <Flex alignItems='center' justifyContent='space-between' className={styles.subtotalRow}>
                            <Text size='m' bold className={styles.savingsText}>
                                total_saved_in_purchase
                            </Text>
                            <Text size='m' bold className={styles.savingsText}>
                                {render({ type: 'coin', value: totalSavings })}
                            </Text>
                        </Flex>
                    </Flex>

                    {/* Total Amount Row */}
                    <Flex alignItems='center' justifyContent='space-between' className={styles.totalRow}>
                        <Text size='xl' bold>
                            total_to_pay
                        </Text>
                        <Text size='xxl' bold className={styles.totalAmount}>
                            {render({ type: 'coin', value: total })}
                        </Text>
                    </Flex>

                    {/* CTA Pay Button */}
                    {showPayBtn && (
                        <button
                            type='button'
                            className={styles.payBtn}
                            onClick={onPayment}
                            disabled={paying}
                        >
                            {paying ? (
                                <Loader size={16} />
                            ) : (
                                <>
                                    <LuCreditCard className={styles.payIcon} />
                                    <Text size='l' bold className={styles.payBtnText}>to_payment_btn</Text>
                                </>
                            )}
                        </button>
                    )}
                </Flex>
            </Card>
        </Flex>
    )
}
