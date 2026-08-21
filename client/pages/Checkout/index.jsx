import { useOrder } from 'features/Order/OrderProvider'
import { useNavigate } from 'react-router'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Collapse from 'common/components/Collapse'
import ProductInline from 'layout/Cart/ProductInline'
import OrderSummary from './OrderSummary'
import styles from './checkout.module.css'
import { useText } from 'common/texts/TextProvider'

export default function Checkout() {
    const { order = {} } = useOrder()
    const { TR } = useText() || {}
    const navigate = useNavigate()

    const cart = order?.cart || []
    const totalItemsCount = cart.reduce((acc, item) => acc + (item.amount || item.units || 1), 0)

    const cartTitle = `${TR('my_cart_title')} (${totalItemsCount} ${TR('items_suffix')})`

    return (
        <div className={styles.checkoutPage}>
            <Flex gap={24} className={styles.container}>
                {/* Main Content Area (Start Side in RTL) */}
                <Flex col gap={16} grow={1} className={styles.mainContent}>
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
                </Flex>

                {/* Sidebar Area (End Side in RTL) */}
                <aside className={styles.sidebar}>
                    <OrderSummary
                        onPayment={() => {
                            console.log('Proceeding to payment...')
                        }}
                    />
                </aside>
            </Flex>
        </div>
    )
}
