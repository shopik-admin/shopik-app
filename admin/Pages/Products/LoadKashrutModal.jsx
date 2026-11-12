import { useRef, useState } from 'react'
import apiReq from 'common/functions/apiReq'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import downloadCsv from 'features/DataManager/DataActions/exportCsv'
import { useText } from 'common/texts/TextProvider'
import styles from './bulkLoad.module.css'

const MAX_CSV_CHARS = 2000000
const LIST_LIMIT = 50
const EXPORT_COLS = [
    { key: 'barcode' },
    { key: 'code' },
    { key: 'name' }
]

function Stat({ label, value, TR }) {
    if (value == null) return null
    return <Flex gap={8} alignItems='center'>
        <Text size='s' mode='sub'>{TR(label)}</Text>
        <Text size='s' bold>{value}</Text>
    </Flex>
}

function RowList({ title, rows, TR }) {
    if (!rows?.length) return null
    return <Flex col gap={4} className={styles.list}>
        <Text size='s' bold>{TR(title)} ({rows.length})</Text>
        {rows.slice(0, LIST_LIMIT).map((row, i) =>
            <Text key={`${row.barcode}-${i}`} size='s' className={styles.listRow}>
                {row.barcode}{row.code ? ` — ${row.code}` : ''}{row.name ? ` — ${row.name}` : ''}
            </Text>)}
        {rows.length > LIST_LIMIT
            && <Text size='s' mode='sub'>{TR('kashrut_load_more', { count: rows.length - LIST_LIMIT })}</Text>}
    </Flex>
}

/**
 * טעינת כשרויות — load rabbinate codes onto products from a CSV.
 *
 * The server owns parsing and matching (server/api/product/load_kashrut.js);
 * this modal only carries the file and the report. `dryRun` is always run first,
 * so the admin sees what would change — including the barcodes that matched no
 * product — before anything is written. Codes are added to the product's existing
 * set, never replaced.
 */
export default function LoadKashrutModal({ onDone }) {
    const { TR } = useText()
    const fileRef = useRef(null)
    const [file, setFile] = useState(null)
    const [report, setReport] = useState(null)
    const [applied, setApplied] = useState(false)
    const [error, setError] = useState(null)

    function handleFile(e) {
        const picked = e.target.files?.[0]
        e.target.value = ''
        if (!picked) return
        setError(null)
        setReport(null)
        setApplied(false)
        if (!/\.csv$|text\/csv/i.test(`${picked.name} ${picked.type}`)) {
            setError('kashrut_load_not_csv')
            return
        }
        const reader = new FileReader()
        reader.onload = () => {
            const csv = String(reader.result || '')
            if (csv.length > MAX_CSV_CHARS) {
                setError('kashrut_load_file_too_large')
                setFile(null)
                return
            }
            setFile({ name: picked.name, csv })
        }
        reader.onerror = () => setError('kashrut_load_not_csv')
        reader.readAsText(picked)
    }

    async function run(dryRun) {
        if (!file?.csv) {
            setError('kashrut_load_no_file')
            return
        }
        setError(null)
        try {
            const res = await apiReq('product/load_kashrut', { csv: file.csv, dryRun })
            setReport(res)
            setApplied(!dryRun)
            if (!dryRun) onDone?.()
        } catch (err) {
            setError(err?.message || String(err))
        }
    }

    function exportUnmatched() {
        if (!report?.unmatched?.length) return
        downloadCsv(EXPORT_COLS, report.unmatched, `kashrut-unmatched-${new Date().toISOString().slice(0, 10)}.csv`, TR)
    }

    return <Flex col gap={14}>
        <Text size='s' mode='sub'>{TR('kashrut_load_hint')}</Text>
        <Text size='s' mode='sub'>{TR('kashrut_load_columns')}</Text>

        <Flex gap={10} alignItems='center'>
            <input
                ref={fileRef}
                type='file'
                accept='.csv,text/csv'
                onChange={handleFile}
                style={{ display: 'none' }}
            />
            <Button
                type='button'
                mode='outline'
                icon='upload'
                onClick={() => fileRef.current?.click()}
                text={TR('kashrut_load_file')}
            />
            {file && <Text size='s'>{file.name}</Text>}
        </Flex>

        {error && <Text size='s' mode='error'>{TR(error)}</Text>}

        <Flex gap={10}>
            <Button
                type='button'
                mode='outline'
                icon='search'
                disabled={!file}
                onClick={() => run(true)}
                text={TR('kashrut_load_check')}
            />
            <Button
                type='button'
                icon='upload'
                disabled={!report || applied}
                onClick={() => run(false)}
                text={TR('kashrut_load_apply')}
            />
        </Flex>

        {report && <Flex col gap={6} className={styles.report}>
            <Flex gap={16} wrap>
                <Stat TR={TR} label='kashrut_load_rows' value={report.rows} />
                <Stat TR={TR} label='kashrut_load_barcodes' value={report.barcodes} />
                <Stat TR={TR} label='kashrut_load_matched' value={report.matched} />
                <Stat TR={TR} label='kashrut_load_updated' value={report.updated} />
                <Stat TR={TR} label='kashrut_load_unchanged' value={report.unchanged} />
                {!!report.legacyConverted && <Stat TR={TR} label='kashrut_load_legacy' value={report.legacyConverted} />}
            </Flex>

            <Text size='s' mode='sub'>{TR(applied ? 'kashrut_load_applied_note' : 'kashrut_load_dry_note')}</Text>

            <RowList TR={TR} title='kashrut_load_unmatched' rows={report.unmatched} />
            <RowList TR={TR} title='kashrut_load_invalid' rows={report.invalid} />

            {!!report.unmatched?.length && <Flex>
                <Button
                    type='button'
                    mode='text'
                    icon='csv'
                    onClick={exportUnmatched}
                    text={TR('kashrut_load_download_unmatched')}
                />
            </Flex>}
        </Flex>}
    </Flex>
}
