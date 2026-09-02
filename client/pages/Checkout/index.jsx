import { useState } from 'react'
import { useOrder } from 'features/Order/OrderProvider'
import { useUser } from 'features/User'
import { useNavigate } from 'react-router'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Collapse from 'common/components/Collapse'
import ProductInline from 'layout/Cart/ProductInline'
import OrderSummary from './OrderSummary'
import styles from './checkout.module.css'
import { useText } from 'common/texts/TextProvider'
import apiReq from 'common/functions/apiReq'
import Loader from 'common/components/Loader'

export default function Checkout() {
    const { order = {} } = useOrder()
    const user = useUser()
    const { TR } = useText() || {}
    const navigate = useNavigate()
    const [paymentUrl, setPaymentUrl] = useState()
    const [paying, setPaying] = useState(false)
    const [payError, setPayError] = useState()
    const [missingFields, setMissingFields] = useState([])

    const cart = order?.cart || []
    const totalItemsCount = cart.reduce((acc, item) => acc + (item.amount || item.units || 1), 0)

    const cartTitle = `${TR('my_cart_title')} (${totalItemsCount} ${TR('items_suffix')})`

    function getLocalMissing() {
        const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0
        const missing = []
        const hasOrderName = order?.name && isNonEmpty(order.name.first) && isNonEmpty(order.name.last)
        const hasUserName = user?.name && isNonEmpty(user.name.first) && isNonEmpty(user.name.last)
        if (!hasOrderName && !hasUserName) missing.push('name')
        if (!isNonEmpty(order?.email) && !isNonEmpty(user?.email)) missing.push('email')
        if (!isNonEmpty(order?.phone) && !isNonEmpty(user?.phone)) missing.push('phone')
        const deliveryMethod = order?.deliveryMethod || 'delivery'
        const isPickup = deliveryMethod === 'pickup'
        if (isPickup) {
            const hasPickup = order?.storeId || (order?.address && isNonEmpty(order.address.city))
            if (!hasPickup && !user?.pickupStoreId) missing.push('address')
        } else {
            const addr = order?.address
            const hasDelivery = addr && isNonEmpty(addr.city) && isNonEmpty(addr.street) && addr.building != null && String(addr.building).trim() !== ''
            if (!hasDelivery) {
                const activeAddr = user?.addresses?.find(a => a.active) || user?.addresses?.[0]
                const hasCandidate = activeAddr && isNonEmpty(activeAddr.city) && isNonEmpty(activeAddr.street) && activeAddr.building != null && String(activeAddr.building).trim() !== ''
                if (!hasCandidate) missing.push('address')
            }
        }
        if (!order?.window || !order.window.id || !order.window.date) missing.push('window')
        return missing
    }

    async function handlePayment() {
        if (paying) return
        // Client-side pre-validation: if we already know fields are missing, open them and don't hit server
        const localMissing = getLocalMissing()
        if (localMissing.length) {
            setMissingFields(localMissing)
            return
        }
        setPaying(true)
        setPayError()
        setMissingFields([])
        try {
            const res = await apiReq('payment/create', { orderId: order.id })
            if (res?.paymentUrl) setPaymentUrl(res.paymentUrl)
        } catch (e) {
            console.error('payment create failed:', e)
            setPayError(e)
            const fields = e?.missingFields || e?.data?.missingFields || []
            if (Array.isArray(fields) && fields.length) {
                // trigger auto-open one-by-one (OrderSummary watches this array)
                setMissingFields(fields)
            }
        } finally {
            setPaying(false)
        }
    }

    return (
        <div className={styles.checkoutPage}>
            <Flex gap={24} className={styles.container}>
                {/* Main Content Area (Start Side in RTL) */}
                <Flex col gap={16} grow={1} className={styles.mainContent}>
                    {paying ? (
                        <Flex center className={styles.paymentLoaderWrapper}>
                            <Loader size={40} />
                        </Flex>
                    ) : paymentUrl ? (
                        <div className={styles.paymentFrameWrapper}>
                            <iframe
                                src={paymentUrl}
                                title='payment'
                                className={styles.paymentFrame}
                                allow='payment'
                            />
                        </div>
                    ) : (
                        <>
                            {/* Accordion 1: Recommended Products */}
                            <Collapse
                                title={
                                    <Text bold size='xl'>
                                        products_especially_for_you
                                    </Text>
                                }
                                defaultOpen={false}
                            >
                                <div className={styles.recommendedContent}>
                                    <Text mode='sub'>no_recommended_products</Text>
                                </div>
                            </Collapse>

                            {/* Accordion 2: My Cart */}
                            <Collapse
                                title={
                                    <Text bold size='xl'>
                                        {cartTitle}
                                    </Text>
                                }
                                defaultOpen={true}
                            >
                                {cart.length === 0 ? (
                                    <Flex col gap={10} className={styles.emptyCart} center>
                                        <Text size='xl' bold>empty_cart_title</Text>
                                        <Text mode='sub'>empty_cart_subtitle</Text>
                                    </Flex>
                                ) : (
                                    <Flex col gap={12} className={styles.cartList}>
                                        {cart.map((item, idx) => (
                                            <ProductInline key={item.id || idx} product={item} />
                                        ))}
                                    </Flex>
                                )}
                            </Collapse>
                        </>
                    )}

                    {payError && !payError?.missingFields && (
                        <Text mode='sub' className={styles.payError}>
                            {(payError?.message || payError || 'payment_failed_generic')}
                        </Text>
                    )}
                </Flex>

                {/* Sidebar Area (End Side in RTL) */}
                <aside className={styles.sidebar}>
                    <OrderSummary onPayment={handlePayment} paying={paying} showPayBtn={!paymentUrl} missingFields={missingFields} />
                </aside>
            </Flex>
        </div>
    )
}
