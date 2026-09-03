import { useState, useMemo, useEffect, useRef } from 'react'
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
import Input from 'common/components/Input'
import Form from 'common/components/Form'
import {
    LuMapPinHouse,
    LuClock,
    LuPencil,
    LuCreditCard,
    LuUserRound
} from 'react-icons/lu'

export default function OrderSummary({ onPayment, paying, showPayBtn = true, missingFields = [] }) {
    const { order = {}, setOrder } = useOrder()
    const user = useUser()
    const { addresses = [] } = user || {}
    const { TR } = useText() || {}

    const [addressOpen, setAddressOpen] = useState(false)
    const [windowOpen, setWindowOpen] = useState(false)
    const [nameOpen, setNameOpen] = useState(false)

    // Refs for focusing missing fields directly 
    const nameFirstRef = useRef(null)
    const emailRef = useRef(null)
    const secondPhoneRef = useRef(null)
    const cityRef = useRef(null)
    const windowRef = useRef(null)

    // Auto-open collapses for missing fields + focus first missing via refs
    useEffect(() => {
        if (!missingFields?.length) return
        const needName = missingFields.includes('name') || missingFields.includes('email') || missingFields.includes('phone') || missingFields.includes('secondPhone')
        const needAddress = missingFields.includes('address')
        const needWindow = missingFields.includes('window')
        if (needName) setNameOpen(true)
        if (needAddress) setAddressOpen(true)
        if (needWindow) setWindowOpen(true)

        const first = missingFields[0]
        const doFocus = () => {
            if (first === 'name' && nameFirstRef.current) {
                nameFirstRef.current.focus()
                try { nameFirstRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) } catch { }
                return
            }
            if (first === 'email' && emailRef.current) {
                emailRef.current.focus()
                try { emailRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) } catch { }
                return
            }
            if ((first === 'phone' || first === 'secondPhone') && secondPhoneRef.current) {
                secondPhoneRef.current.focus()
                try { secondPhoneRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) } catch { }
                return
            }
            if (first === 'address' && cityRef.current) {
                cityRef.current.focus()
                try { cityRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) } catch { }
                return
            }
            if (first === 'window' && windowRef.current) {
                try { windowRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) } catch { }
            }
        }
        // Collapse animation ~300ms, wait a bit longer so input is mounted/visible
        const t = setTimeout(doFocus, 450)
        // retry once in case autocomplete mounts async
        const t2 = setTimeout(doFocus, 900)
        return () => { clearTimeout(t); clearTimeout(t2) }
    }, [missingFields])

    const displayName = (() => {
        const n = order?.name?.first ? order.name : user?.name
        if (n?.first || n?.last) return `${n.first || ''} ${n.last || ''}`.trim()
        return TR?.('name') || 'שם מלא'
    })()

    // Get active address from user state or order fallback
    const activeAddress = addresses.find(a => a.active) || addresses[0] || order?.address
    const addressText = activeAddress
        ? `${activeAddress.street} ${activeAddress.building}${activeAddress.apartment ? ' דירה ' + activeAddress.apartment : ''}, ${activeAddress.city}`
        : 'no_address_selected'

    // Get active window from order state
    const activeWindow = order.window
    const deliveryTimeText = (() => {
        if (!activeWindow?.id) return order.deliveryWindow || TR?.('choose window')
        const dayIdx = activeWindow.dayOfWeek ?? (activeWindow.date ? new Date(activeWindow.date + 'T12:00:00').getDay() : null)
        const dayName = dayIdx != null ? (TR?.(`day-${dayIdx}`) || activeWindow.dayName || '') : (activeWindow.dayName || '')
        const time = `${String(activeWindow.start).padStart(2, '0')}:00-${String(activeWindow.end).padStart(2, '0')}:00`
        return dayName ? `${dayName}, ${time}` : time
    })()

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
                {TR?.('order_summary_title').replace('{orderNumber}', order?.number || '')}
            </Text>

            <Card className={styles.summaryCard}>
                <Flex col>
                    {/* 0. Name Collapse Item */}
                    <Collapse
                        open={nameOpen}
                        onToggle={setNameOpen}
                        showChevron={false}
                        className={styles.summaryCollapse}
                        title={
                            <Flex alignItems='center' justifyContent='space-between' width='100%'>
                                <Flex alignItems='center' gap={12}>
                                    <div className={styles.iconCircle}>
                                        <LuUserRound className={styles.rowIcon} />
                                    </div>
                                    <Text bold size='m' className={styles.rowText}>
                                        {displayName}
                                    </Text>
                                </Flex>
                                <button
                                    type='button'
                                    className={styles.editBtn}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setNameOpen(prev => !prev)
                                    }}
                                    aria-label={TR?.('edit_name') || 'edit name'}
                                >
                                    <LuPencil />
                                </button>
                            </Flex>
                        }
                    >
                        <div className={styles.collapseContent}>
                            <NameForm
                                initialName={order?.name?.first ? order.name : user?.name}
                                initialEmail={order?.email || user?.email || ''}
                                initialPhone={order?.phone || user?.phone || ''}
                                initialSecondPhone={order?.secondPhone || user?.secondPhone || ''}
                                missingFields={missingFields}
                                nameFirstRef={nameFirstRef}
                                emailRef={emailRef}
                                secondPhoneRef={secondPhoneRef}
                                onDone={() => setNameOpen(false)}
                            />
                        </div>
                    </Collapse>

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
                                <Addresses hideHeader action={{ onClick: () => setAddressOpen(false) }} />
                            ) : (
                                <AddressForm onDone={() => setAddressOpen(false)} cityRef={cityRef} />
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
                        <div ref={windowRef} className={styles.collapseContent}>
                            {windowOpen && <WindowOptions hideAddress />}
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

function NameForm({ initialName, initialEmail, initialPhone, initialSecondPhone, missingFields = [], nameFirstRef, emailRef, secondPhoneRef, onDone }) {
    const user = useUser()
    const { setOrder } = useOrder()
    const [formState, setFormState] = useState({})

    async function handleSubmit(data) {
        setFormState({ loading: true, error: '' })
        try {
            const payload = {}
            if (data['name.first'] !== undefined) payload['name.first'] = data['name.first']
            if (data['name.last'] !== undefined) payload['name.last'] = data['name.last']
            if (data.email !== undefined) payload.email = data.email
            if (data.secondPhone !== undefined && String(data.secondPhone).trim() !== '') payload.secondPhone = String(data.secondPhone).trim()
            const res = await user.userEdit(payload)
            const updatedName = res?.user?.name || { first: data['name.first'], last: data['name.last'] }
            const updatedEmail = res?.user?.email || data.email
            const updatedSecondPhone = res?.user?.secondPhone || data.secondPhone
            setOrder(prev => ({
                ...(prev || {}),
                name: updatedName?.first || updatedName?.last ? updatedName : prev?.name,
                email: updatedEmail || prev?.email,
                secondPhone: updatedSecondPhone || prev?.secondPhone
            }))
            setFormState({ loading: false })
            onDone?.()
        } catch (err) {
            setFormState({ error: err?.message || String(err), loading: false })
            throw err
        }
    }

    return (
        <Form action={handleSubmit} {...formState} submitText={initialName?.first ? 'user_details_update' : 'user_details_save'}>
            <Flex col gap={10}>
                {/* Phone as info only */}
                {initialPhone ? (
                    <Flex gap={6} alignItems='center'>
                        <Text size='s' mode='sub'>טלפון:</Text>
                        <Text size='m' bold>{initialPhone}</Text>
                    </Flex>
                ) : null}
                <Flex gap={10}>
                    <Input ref={nameFirstRef} name='name.first' defaultValue={initialName?.first || ''} required label='שם פרטי' placeholder='שם פרטי' />
                    <Input name='name.last' defaultValue={initialName?.last || ''} required label='שם משפחה' placeholder='שם משפחה' />
                </Flex>
                <Input ref={emailRef} name='email' type='email' defaultValue={initialEmail || ''} required label='אימייל' placeholder='אימייל' />
                <Input ref={secondPhoneRef} name='secondPhone' type='tel' defaultValue={initialSecondPhone || ''} label='טלפון נוסף' placeholder='טלפון נוסף' />
            </Flex>
        </Form>
    )
}
