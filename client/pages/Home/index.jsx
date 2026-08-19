import Button from 'common/components/Button'
import events from 'common/features/events'
import styles from './home.module.css'

export default function Home({ }) {
    return <div className={styles.home}>
        Home
        <Button onClick={() => events.emit('login-popover')}>login</Button>
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
