import { Fragment, useEffect, useState } from 'react'
import Button from 'common/components/Button'
import Card from 'common/components/Card'
import Checkbox from 'common/components/Checkbox'
import Flex from 'common/components/Flex'
import Input from 'common/components/Input'
import Select from 'common/components/Select'
import Table from 'common/components/Table'
import Text from 'common/components/Text'
import Badge from 'common/components/Badge'
import apiReq from 'common/functions/apiReq'
import useApi from 'common/functions/useApi'
import { useText } from 'common/texts/TextProvider'
import { REPORTS } from 'common/constants/reports.js'
import styles from './reports.module.css'

function formatDate(value) {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const pad = number => String(number).padStart(2, '0')
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatSize(bytes) {
    if (!bytes) return ''
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const HISTORY_COLUMNS = [
    {
        key: 'fileName',
        text: 'reports_col_file',
        render: row => <a href={row.url} className={styles.fileLink}>{row.fileName}</a>
    },
    { key: 'generatedAt', text: 'reports_col_date', render: row => formatDate(row.generatedAt) },
    { key: 'generatedByName', text: 'reports_col_user' },
    { key: 'rowCount', text: 'reports_col_rows' },
    { key: 'sizeBytes', text: 'reports_col_size', render: row => formatSize(row.sizeBytes) }
]

export default function Reports() {
    const { TR } = useText()
    const [typeId, setTypeId] = useState(REPORTS[0]?.id || '')
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')
    const [force, setForce] = useState(false)
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)
    const [running, setRunning] = useState(false)
    const history = useApi('report/list', { type: typeId }, { hold: true })

    const type = REPORTS.find(report => report.id === typeId) || REPORTS[0]
    const produced = Array.isArray(history.data) ? history.data : []

    useEffect(() => {
        if (typeId) history.callReq({ type: typeId })
        setResult(null)
        setError(null)
    }, [typeId])

    async function run() {
        setRunning(true)
        setError(null)
        setResult(null)
        try {
            const report = await apiReq('report/run', { type: typeId, from, to, force })
            setResult(report)
            history.callReq({ type: typeId })
        } catch (err) {
            setError(err?.message || TR('reports_error'))
        } finally {
            setRunning(false)
        }
    }

    return <div className={styles.page}>
        <Flex className={styles.header} col gap={4}>
            <Text size='h2' bold text='reports_page' />
            <Text size='s' className={styles.muted} text='reports_hint' />
        </Flex>

        <Flex className={styles.controls} gap={12} alignItems='end' wrap>
            <div className={styles.field}>
                <Text size='s' className={styles.label} text='reports_type' />
                <Select
                    options={REPORTS.map(report => ({ value: report.id, text: report.text }))}
                    value={typeId}
                    onChange={event => setTypeId(event.target.value)}
                />
            </div>

            {type?.dateRange && <>
                <Input
                    className={styles.field}
                    type='date'
                    name='from'
                    label='reports_from'
                    value={from}
                    onChange={event => setFrom(event.target.value)}
                />
                <Input
                    className={styles.field}
                    type='date'
                    name='to'
                    label='reports_to'
                    value={to}
                    onChange={event => setTo(event.target.value)}
                />
            </>}

            <Button
                icon='reports'
                text='reports_run'
                onClick={run}
                loading={running}
                disabled={!type}
                permission='report:run'
            />
            <Checkbox
                label='reports_force'
                checked={force}
                onChange={event => setForce(event.target.checked)}
            />
        </Flex>

        {running && <Text size='s' className={styles.muted} text='reports_running' />}

        {error && <Text className={styles.error}>{error}</Text>}

        {result && <Card className={styles.result}>
            <Flex gap={12} alignItems='center' wrap>
                <Flex col gap={2} grow>
                    <Flex gap={8} alignItems='center' wrap>
                        <Text bold text='reports_created' />
                        {result.reused && <Badge><Text size='xs' text='reports_reused' /></Badge>}
                    </Flex>
                    <Flex gap={6} wrap alignItems='center' className={styles.meta}>
                        {[
                            result.fileName,
                            `${result.rowCount} ${TR('reports_col_rows')}`,
                            formatSize(result.sizeBytes),
                            formatDate(result.generatedAt),
                            result.generatedByName
                        ].filter(Boolean).map((part, index) => <Fragment key={index}>
                            {index > 0 && <span aria-hidden='true' className={styles.separator}>·</span>}
                            <bdi>{part}</bdi>
                        </Fragment>)}
                    </Flex>
                </Flex>
                <a href={result.url}>
                    <Button icon='download' text='reports_download' />
                </a>
            </Flex>
        </Card>}

        <Card title='reports_history'>
            {produced.length
                ? <Table cols={HISTORY_COLUMNS} rows={produced} />
                : <Text size='s' className={styles.muted} text='reports_empty' />}
        </Card>
    </div>
}
