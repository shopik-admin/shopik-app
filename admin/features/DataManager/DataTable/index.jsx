import usePermission from 'common/permissions/usePermision'
import DataRowActions from '../DataRowActions'
import Table from 'common/components/Table'
import Loader from '#common/components/Loader/index.jsx'
import styles from './dataTable.module.css'
import { useData } from '../DataProvider'

export default function DataTable({ cols = [], rowActions = [], onRowClick }) {
    const
        { apiRoute, data, sort, setSort, loadMore, loadingMore, hasMore } = useData(),
        idPermission = usePermission(`${apiRoute}:id`)

    if (rowActions.length && cols.at(-1)?.key != ' ')
        cols.push({ key: ' ', sticky: 'end', render: row => <DataRowActions row={row} actions={rowActions} /> })

    // the scroll container is the Table's inner root, so listen in capture phase
    function onScrollCapture(e) {
        const el = e.target
        if (!hasMore || loadingMore || !el) return
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 250) loadMore()
    }

    return <div className={styles.dataTable} onScrollCapture={onScrollCapture}>
        <Table
            cols={cols}
            rows={data}
            sort={sort}
            setSort={setSort}
            onRowClick={idPermission ? onRowClick : undefined}
        />
        {loadingMore && <div className={styles.loaderRow}><Loader /></div>}
    </div>
}
