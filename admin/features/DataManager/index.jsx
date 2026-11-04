import styles from './dataManager.module.css'
import DataProvider from './DataProvider'
import DataCount from './DataCount'
import DataLoader from './DataLoader'
import DataTable from './DataTable'
import FilterBar from './FilterBar'

// `filters` / `search` off: a page that shows no controls of its own — the ops queue
// roles work a handful of orders at a time. The actions and the loading row still
// render, and when there is nothing at all left to show the bar returns nothing.
export default function DataManager({ children, actions, rowActions, cols = [], onRowClick, filters = true, search = true, ...props }) {

    return <DataProvider {...props}>
        <div className={styles.dataManager}>
            <FilterBar actions={actions} cols={cols} filters={filters} search={search} />
            {children || <>
                <DataTable cols={cols} rowActions={rowActions} onRowClick={onRowClick} />
                <DataCount />
            </>}
        </div>
    </DataProvider>
}
