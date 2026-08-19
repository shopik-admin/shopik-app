import Input from '#common/components/Input/index.jsx'
import styles from './search.module.css'

export default function Search({ }) {
    return <div className={styles.search}>
        <Input placeholder='main_search_placeholder' />
    </div>
}
