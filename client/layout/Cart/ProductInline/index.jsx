import Flex from '#common/components/Flex/index.jsx'
import { ProductButton, ProductImage, ProductInfo, ProductPrice } from 'pages/Products/ProductCard'
import styles from './productInline.module.css'
import Card from '#common/components/Card/index.jsx'
import Icon from '#common/components/Icon/index.jsx'
import Button from '#common/components/Button/index.jsx'
import { useState } from 'react'
import classNames from '#common/functions/classNames.js'

export default function ProductInline(props) {
    const [noteOpen, setNoteOpen] = useState()

    return <Flex tag={Card} gap={10} className={styles.productInline}>
        <ProductImage {...props} size='s' />
        <Flex col gap={5} justifyContent='space-around' grow={1}>
            <Button icon='trash' mode='text' stopPropagation preventDefault className={styles.remove} />
            <ProductInfo {...props} size='s' />
            <Flex alignItems='center' justifyContent='space-between'>
                <Button
                    onClick={() => setNoteOpen(n => !n)}
                    icon='note' mode='text' stopPropagation preventDefault

                    className={classNames(styles.note, [styles.active, noteOpen])} />
                <ProductButton {...props} size='s' />
            </Flex>
        </Flex>
    </Flex>
}
