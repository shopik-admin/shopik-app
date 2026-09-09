import Flex from '#common/components/Flex'
import Banner from './Banner'
import ProductCarousel from './ProductCarousel'
import styles from './display.module.css'

export default function DisplayBlocks({ blocks = [] }) {
    if (!blocks.length) return null
    return <Flex col gap={20} className={styles.blocks}>
        {blocks.map(block => block.kind === 'banner'
            ? <Banner key={block.id} block={block} />
            : <ProductCarousel key={block.id} block={block} />)}
    </Flex>
}
