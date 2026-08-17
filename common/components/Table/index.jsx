import render from 'common/functions/render'
import styles from './table.module.css'
import Icon from '../Icon'
import Text from '../Text'

export default function Table({ cols = [], rows = [], sort = {}, setSort, onRowClick }) {
    return <div className={styles.table}>
        <table>
            <thead>
                <tr>
                    {cols.map(col => <th
                        key={col.key}
                        onClick={() => setSort?.({ [col.key]: sort[col.key] == 1 ? -1 : 1 })}
                        style={{ cursor: 'pointer' }}
                    >
                        <Text size='none'>{col.text || col.key || ''}</Text>
                        {(sort[col.key]) ?
                            <Icon name={sort[col.key] == 1 ? 'sortUp' : 'sortDown'} /> :
                            <Icon name='sort' className={styles.noSort} />}
                    </th>)}
                </tr>
            </thead>
            <tbody>
                {rows.map((row, index) => (
                    <tr key={row.id || index} onClick={() => onRowClick?.(row, index)}>
                        {cols.map((col) => (
                            <td key={col.key}>
                                <bdi>
                                    {col.render ? col.render(row) : render({ type: col.type, value: getValue(col.key, row) })}
                                </bdi>
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
}

function getValue(name, row) {
    return name.split('.').reduce((obj, key) => obj?.[key], row)
}