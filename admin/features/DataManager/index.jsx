import Flex from '#common/components/Flex/index.jsx'
import styles from './dataManager.module.css'
import DataProvider from './DataProvider'
import DataActions from './DataActions'
import DataLoader from './DataLoader'
import DataSearch from './DataSearch'
import DataTable from './DataTable'

export default function DataManager({ actions, rowActions, cols = [], onRowClick, ...props }) {

    return <DataProvider className={styles.dataManager} {...props}>
        <Flex alignItems='center' justifyContent='space-between'>
            <Flex alignItems='center' gap={20}>
                <DataSearch />
                <DataLoader />
            </Flex>
            <DataActions actions={actions} />
        </Flex>
        <DataTable cols={cols} rowActions={rowActions} onRowClick={onRowClick} />
    </DataProvider>
}
