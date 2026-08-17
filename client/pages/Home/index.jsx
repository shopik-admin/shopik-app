import styles from './home.module.css'

export default function Home({ }) {
    return <div className={styles.home}>
        Home
    </div>
}

Home.init = async function init({ }) {
    return {
        title: 'home page',
        data: {
            sales: 'sales data'
        }
    }
}