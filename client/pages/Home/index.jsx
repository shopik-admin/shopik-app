import Button from 'common/components/Button'
import events from 'common/features/events'
import styles from './home.module.css'
import Text from '#common/components/Text/index.jsx'

export default function Home({ }) {
    return <div className={styles.home}>
        <Text center bold size='h1'>Shopik Home</Text>
    </div>
}

Home.init = async function init({ } = {}) {
    return {
        title: 'home page',
        data: {
            sales: 'sales data'
        }
    }
}
