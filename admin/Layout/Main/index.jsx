import styles from './main.module.css'
import { Outlet } from 'react-router'

export default function Main({ }) {
    return <main className={styles.main}>
        <Outlet />
    </main>
}
