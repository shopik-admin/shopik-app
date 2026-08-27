import { useState } from 'react'
import { useOrder } from 'features/Order/OrderProvider'
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
    const { TR } = useText() || {}
    const navigate = useNavigate()
    const [paymentUrl, setPaymentUrl] = useState()
    const [paying, setPaying] = useState(false)
    const [payError, setPayError] = useState()

    const cart = order?.cart || []
    const totalItemsCount = cart.reduce((acc, item) => acc + (item.amount || item.units || 1), 0)

    const cartTitle = `${TR('my_cart_title')} (${totalItemsCount} ${TR('items_suffix')})`

    async function handlePayment() {
        if (paying) return
        setPaying(true)
        setPayError()
        try {
            const res = await apiReq('payment/create', { orderId: order.id })
            if (res?.paymentUrl) setPaymentUrl(res.paymentUrl)
        } catch (e) {
            console.error('payment create failed:', e)
            setPayError(e)
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

                    {payError && (
                        <Text mode='sub' className={styles.payError}>
                            payment_failed_generic
                        </Text>
                    )}
                </Flex>

                {/* Sidebar Area (End Side in RTL) */}
                <aside className={styles.sidebar}>
                    <OrderSummary onPayment={handlePayment} paying={paying} showPayBtn={!paymentUrl} />
                </aside>
            </Flex>
        </div>
    )
}
