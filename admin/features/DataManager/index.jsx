import Flex from '#common/components/Flex/index.jsx'
import styles from './dataManager.module.css'
import DataProvider from './DataProvider'
import DataActions from './DataActions'
import DataCount from './DataCount'
import DataLoader from './DataLoader'
import DataTable from './DataTable'
import FilterBar from './FilterBar'

export default function DataManager({ actions, rowActions, cols = [], onRowClick, ...props }) {

    return <DataProvider className={styles.dataManager} {...props}>
        <Flex alignItems='center' justifyContent='space-between' wrap gap={12}>
            <DataLoader />
            <DataActions actions={actions} cols={cols} />
        </Flex>
        <FilterBar />
        <DataTable cols={cols} rowActions={rowActions} onRowClick={onRowClick} />
        <DataCount />
    </DataProvider>
}
