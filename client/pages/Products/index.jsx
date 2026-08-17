import styles from './products.module.css'
import { usePage } from 'layout/Page'

export default function Products({ }) {
    const pData = usePage()
    console.log(pData)
    return <div className={styles.products}>
        Products1a
    </div>
}

Products.init = async function () {
    console.log('products init')
    return {
        title: Date.now() + 'hi',
        data: { a: 1 }
    }
}