import { useSidebar } from '../Sidebar'
import styles from './domainSelector.module.css'

export default function DomainSelector({ }) {
    const { mini } = useSidebar()
    return <div className={styles.domainSelector} style={{ opacity: mini ? 0 : 1 }}>
        Domain Selector
    </div>
}
