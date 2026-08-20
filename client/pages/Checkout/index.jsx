import { useOrder } from 'features/Order/OrderProvider'
import { useNavigate } from 'react-router'
import styles from './checkout.module.css'
import { useEffect } from 'react'

export default function Checkout({ }) {
    const { order } = useOrder()
    const navigate = useNavigate()

    useEffect(() => {
        if (!order?.cart?.length)
            navigate('/')
    }, [order])

    return <div className={styles.checkout}>
        Checkout
    </div>
}
