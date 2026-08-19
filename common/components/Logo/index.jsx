import styles from './logo.module.css'
import { Link } from 'react-router'
import logo from './logo.svg'

export default function Logo({ }) {
    return <Link to='/' className={styles.logo}>
        <img src={logo} alt="logo" />
    </Link>
}
