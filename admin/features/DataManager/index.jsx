import styles from './dataManager.module.css'
import DataProvider from './DataProvider'
import DataCount from './DataCount'
import DataLoader from './DataLoader'
import DataTable from './DataTable'
import FilterBar from './FilterBar'

export default function DataManager({ children, actions, rowActions, cols = [], onRowClick, ...props }) {

    return <DataProvider className={styles.dataManager} {...props}>
        <FilterBar actions={actions} cols={cols} />
        {children || <>
            <DataLoader />
            <DataTable cols={cols} rowActions={rowActions} onRowClick={onRowClick} />
            <DataCount />
        </>}
    </DataProvider>
}
