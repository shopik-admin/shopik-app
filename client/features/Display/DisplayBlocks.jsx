import Flex from '#common/components/Flex'
import Banner from './Banner'
import ProductCarousel from './ProductCarousel'
import styles from './display.module.css'

export default function DisplayBlocks({ blocks = [] }) {
    if (!blocks.length) return null
    return <Flex col gap={16} className={styles.blocks}>
        {blocks.map(block => {
            if (block.kind === 'banner') return <Banner key={block.id} block={block} />
            if (block.kind === 'product_carousel') return <ProductCarousel key={block.id} block={block} />
            return null
        })}
    </Flex>
}
