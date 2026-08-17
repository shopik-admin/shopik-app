import Loader from '#common/components/Loader/index.jsx'
import Text from '#common/components/Text/index.jsx'
import styles from './dataLoader.module.css'
import { useData } from '../DataProvider'

export default function DataLoader({ }) {
    const { loading, error } = useData()
    return loading ? <Loader /> : error ? <Text mode='error'>{error}</Text> : null
}
