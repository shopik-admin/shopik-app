import Text from '#common/components/Text/index.jsx'
import styles from './menu.module.css'
import { Link } from 'react-router'

export default function Menu({ }) {
    return <nav className={styles.menu}>
        <Link to='/'><Text>home</Text></Link>
        <br />
        <Link to='/products'><Text>products</Text></Link>
    </nav>
}
