import { useState } from 'react'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Card from 'common/components/Card'
import Collapse from 'common/components/Collapse'
import Loader from 'common/components/Loader'
import render from '#common/functions/render.js'
import styles from './orderSummary.module.css'
import { useUser } from 'features/User'
import { useOrder } from 'features/Order/OrderProvider'
import WindowOptions from 'features/Order/WindowOptions'
import Addresses, { AddressForm } from 'pages/Account/Addresses'
import { useText } from 'common/texts/TextProvider'
import { CouponCollapse } from './CouponSection'
import {
    LuMapPinHouse,
    LuClock,
    LuTags,
    LuTicketPercent,
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
    const cart = order.cart || []
    const subtotal = order.sum ?? order.subtotal ?? cart.reduce((acc, item) => acc + ((item.price || 0) * (item.amount || 1)), 0)
    const deliveryFee = order.deliveryFee ?? order.delivery ?? 29.0
    const totalSavings = order.savings ?? order.discount ?? 0
    const total = order.total ?? order.finalSum ?? (subtotal + deliveryFee - (totalSavings > 0 ? totalSavings : 0))

    return (
        <Flex col gap={15} className={styles.orderSummaryWrapper}>
            <Text size='xxl' bold className={styles.title}>
                order_summary_title
            </Text>

            <Card className={styles.summaryCard}>
                <Flex col gap={8}>
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
                                    <Text bold size='s' className={styles.rowText}>
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
                                    <Text bold size='s' className={styles.rowText}>
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

                    <div className={styles.divider} />

                    {/* Financial Breakdown */}
                    <Flex col gap={8} className={styles.breakdown}>
                        <Flex alignItems='center' justifyContent='space-between'>
                            <Text mode='sub' size='s'>
                                subtotal_text
                            </Text>
                            <Text mode='sub' size='s' bold>
                                {render({ type: 'coin', value: subtotal })}
                            </Text>
                        </Flex>

                        <Flex alignItems='center' justifyContent='space-between'>
                            <Text mode='sub' size='s'>
                                handling_and_delivery
                            </Text>
                            <Text mode='sub' size='s' bold>
                                {render({ type: 'coin', value: deliveryFee })}
                            </Text>
                        </Flex>

                        <Flex alignItems='center' justifyContent='space-between' className={styles.savingsRow}>
                            <Text size='s' bold className={styles.savingsText}>
                                total_saved_in_purchase
                            </Text>
                            <Text size='s' bold className={styles.savingsText}>
                                {render({ type: 'coin', value: totalSavings })}
                            </Text>
                        </Flex>
                    </Flex>

                    <div className={styles.divider} />

                    {/* Total Amount Row */}
                    <Flex alignItems='center' justifyContent='space-between' className={styles.totalRow}>
                        <Text size='xl' bold>
                            total_to_pay
                        </Text>
                        <Text size='xxl' bold className={styles.totalAmount}>
                            {typeof total === 'number' ? total.toFixed(2) : total}
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
