import styles from './dataManager.module.css'
import DataProvider from './DataProvider'
import DataCount from './DataCount'
import DataLoader from './DataLoader'
import DataTable from './DataTable'
import FilterBar from './FilterBar'

// `filters` off: a page that has no filter controls of its own (the ops queue roles
// are fixed by their tabs). Search and the actions still render, only the filter bar
// and its chips are skipped.
export default function DataManager({ children, actions, rowActions, cols = [], onRowClick, filters = true, ...props }) {

    return <DataProvider {...props}>
        <div className={styles.dataManager}>
            <FilterBar actions={actions} cols={cols} filters={filters} />
            {children || <>
                <DataTable cols={cols} rowActions={rowActions} onRowClick={onRowClick} />
                <DataCount />
            </>}
        </div>
    </DataProvider>
}
