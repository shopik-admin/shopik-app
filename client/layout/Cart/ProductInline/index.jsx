import Flex from '#common/components/Flex/index.jsx'
import { ProductButton, ProductImage, ProductInfo, ProductPrice } from 'pages/Products/ProductCard'
import styles from './productInline.module.css'
import Card from '#common/components/Card/index.jsx'
import Button from '#common/components/Button/index.jsx'
import { useState } from 'react'
import classNames from '#common/functions/classNames.js'
import { useOrder } from 'features/Order/OrderProvider'
import calcOrder from '#common/functions/calcOrder/cart.js'

export default function ProductInline({ remove = true, note = true, ...props }) {
    const { product } = props
    const { order = {}, setOrder } = useOrder()
    const [noteOpen, setNoteOpen] = useState()

    function handleRemove() {
        if (product) {
            const updatedOrder = calcOrder({
                order,
                product,
                amount: 0
            })
            setOrder(updatedOrder)
        }
    }

    return <Flex tag={Card} gap={10} className={styles.productInline}>
        <ProductImage {...props} size='s' />
        <Flex col gap={5} justifyContent='space-around' grow={1}>
            {remove && <Button icon='trash' mode='text' stopPropagation preventDefault onClick={handleRemove} className={styles.remove} />}
            <ProductInfo {...props} size='s' />
            <Flex alignItems='center' justifyContent='space-between'>
                {note && <Button
                    onClick={() => setNoteOpen(n => !n)}
                    icon='note' mode='text' stopPropagation preventDefault
                    className={classNames(styles.note, [styles.active, noteOpen])} />}
                <ProductButton {...props} size='s' />
            </Flex>
        </Flex>
    </Flex>
}
