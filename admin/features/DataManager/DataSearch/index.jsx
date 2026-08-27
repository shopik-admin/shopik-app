import styles from './dataSearch.module.css'
import Input from 'common/components/Input'
import { useData } from '../DataProvider'

let to
export default function DataSearch({ className = '' }) {
    const { search: searchValue, setSearch } = useData()

    function search(e) {
        let { value } = e.target
        clearTimeout(to)
        value = value.trim().replace(/[&\/\\#,+()!@$~%.":*?<>{}]/g, '')
        to = setTimeout(() => setSearch?.(value), 300)
    }

    return <Input
        className={`${styles.search} ${className}`}
        placeholder='חיפוש..'
        defaultValue={searchValue}
        onChange={search}
        type='search'
        icon='search'
    />
}