import usePermission from 'common/permissions/usePermision'
import DataRowActions from '../DataRowActions'
import Table from 'common/components/Table'
import styles from './dataTable.module.css'
import { useData } from '../DataProvider'

export default function DataTable({ cols = [], rowActions = [], onRowClick }) {
    const
        { apiRoute, data, sort, setSort } = useData(),
        idPermission = usePermission(`${apiRoute}:id`)

    if (rowActions.length && cols.at(-1)?.key != ' ')
        cols.push({ key: ' ', sticky: 'end', render: row => <DataRowActions row={row} actions={rowActions} /> })

    return <div className={styles.dataTable}>
        <Table
            cols={cols}
            rows={data}
            sort={sort}
            setSort={setSort}
            onRowClick={idPermission ? onRowClick : undefined}
        />
    </div>
}
