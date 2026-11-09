import { useRef, useState } from 'react'
import apiReq from 'common/functions/apiReq'
import Button from 'common/components/Button'
import Checkbox from 'common/components/Checkbox'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import downloadCsv from 'features/DataManager/DataActions/exportCsv'
import { useText } from 'common/texts/TextProvider'
import styles from './bulkLoad.module.css'

// Mirrors server/services/image/uploadBulk.js. The server validates again —
// this only saves the admin a round trip for an obviously bad selection.
const MAX_FILES = 500
const LIST_LIMIT = 50
const ACCEPT = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp'
const EXPORT_COLS = [
    { key: 'name' },
    { key: 'barcode' },
    { key: 'reason' }
]
const SOURCE_TEXT = {
    upload: 'image_load_source_upload',
    gs1: 'image_load_source_gs1',
    scrape: 'image_load_source_scrape',
    comax: 'image_load_source_comax',
    none: 'image_load_source_none'
}

function readBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || '').split(',').pop())
        reader.onerror = () => reject(new Error('could not read the file'))
        reader.readAsDataURL(file)
    })
}

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
            <Text key={`${row.name}-${i}`} size='s' className={styles.listRow}>
                {row.name}{row.barcode ? ` — ${row.barcode}` : ''}{row.names ? ` — ${row.names.join(' / ')}` : ''}
            </Text>)}
        {rows.length > LIST_LIMIT
            && <Text size='s' mode='sub'>{TR('image_load_more', { count: rows.length - LIST_LIMIT })}</Text>}
    </Flex>
}

/**
 * טעינת תמונות — replace product main images from a batch of files.
 *
 * Two steps, same shape as טעינת כשרויות: the check pass sends file NAMES only
 * and reports what would change (server/services/image/upload_images_check.js);
 * the apply pass uploads exactly the files the server accepted, a few at a
 * time, so one broken image cannot fail the whole run.
 *
 * An uploaded main is written as `upload://<barcode>`, which outranks GS1,
 * scraped and Comax images in every writer's guard (services/image/sourcePriority.js)
 * — from now on only another upload can change that picture.
 */
export default function LoadImagesModal({ onDone }) {
    const { TR } = useText()
    const fileRef = useRef(null)
    const [picked, setPicked] = useState([])
    const [report, setReport] = useState(null)
    const [statuses, setStatuses] = useState({})
    const [doneCount, setDoneCount] = useState(0)
    const [busy, setBusy] = useState(false)
    const [applied, setApplied] = useState(false)
    const [allowAlternates, setAllowAlternates] = useState(false)
    const [error, setError] = useState(null)

    function reset(nextPicked) {
        setPicked(nextPicked)
        setReport(null)
        setStatuses({})
        setDoneCount(0)
        setApplied(false)
        setAllowAlternates(false)
        setError(null)
    }

    function handleFiles(e) {
        const files = Array.from(e.target.files || [])
        e.target.value = ''
        if (!files.length) return
        if (files.length > MAX_FILES) {
            reset([])
            setError(TR('image_load_too_many', { count: MAX_FILES }))
            return
        }
        reset(files)
    }

    async function runCheck() {
        if (!picked.length) {
            setError(TR('image_load_no_files'))
            return
        }
        setError(null)
        setReport(null)
        setStatuses({})
        setDoneCount(0)
        try {
            setReport(await apiReq('product/upload_images_check', {
                // `selection`, never `files` — apiReq reserves that key for
                // multipart bodies (see server/api/product/upload_images_check.js).
                selection: picked.map(file => ({ name: file.name, bytes: file.size }))
            }))
        } catch (err) {
            setError(err?.message || String(err))
        }
    }

    async function runUpload() {
        const accepted = report?.accepted || []
        if (!accepted.length) return
        setError(null)
        setBusy(true)

        const fileByName = new Map(picked.map(file => [file.name, file]))
        const queue = [...accepted]
        const mark = (name, patch) => setStatuses(prev => ({ ...prev, [name]: { ...(prev[name] || {}), ...patch } }))

        // Same worker-pool shape as scripts/reprocessProductImages.js: the
        // server reports how many uploads it can hold at once (`concurrency`)
        // and we never have more than that in flight — one file per request.
        const worker = async () => {
            while (queue.length) {
                const item = queue.shift()
                mark(item.name, { state: 'uploading', barcode: item.barcode })
                try {
                    const file = fileByName.get(item.name)
                    if (!file) throw new Error('file is no longer selected')
                    const fileBase64 = await readBase64(file)
                    let res, err
                    // 429 = another admin (or another tab) is holding the slots.
                    // Wait for one instead of failing the file.
                    for (let attempt = 0; attempt < 3; attempt++) {
                        try {
                            res = await apiReq('product/upload_image', { name: item.name, fileBase64 })
                            err = null
                            break
                        } catch (e) {
                            err = e
                            if (e?.status !== 429) break
                            await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)))
                        }
                    }
                    if (err) throw err
                    mark(item.name, { state: 'done', barcode: item.barcode, replaced: res?.replaced })
                } catch (e) {
                    mark(item.name, { state: 'error', barcode: item.barcode, reason: e?.message || String(e) })
                }
                setDoneCount(count => count + 1)
            }
        }
        const pool = Math.max(1, Math.min(report?.concurrency || 3, accepted.length))
        try {
            await Promise.all(Array.from({ length: pool }, worker))
        } finally {
            setApplied(true)
            setBusy(false)
            onDone?.()
        }
    }

    function exportFailures() {
        const rows = Object.entries(statuses)
            .filter(([, status]) => status.state === 'error')
            .map(([name, status]) => ({ name, barcode: status.barcode || '', reason: status.reason || '' }))
        if (!rows.length) return
        downloadCsv(EXPORT_COLS, rows, `image-upload-failures-${new Date().toISOString().slice(0, 10)}.csv`, TR)
    }

    const accepted = report?.accepted || []
    const alternates = report?.alternates || []
    const needsAlternatesOk = alternates.length > 0 && !allowAlternates
    const failures = Object.values(statuses).filter(status => status?.state === 'error').length
    const total = accepted.length
    const fileStates = Object.entries(statuses)
    // A clean run is finished: re-running would re-upload identical files.
    // With failures the admin is expected to fix them and run again.
    const finished = applied && !failures

    return <Flex col gap={14}>
        <Text size='s' mode='sub'>{TR('image_load_hint')}</Text>
        <Text size='s' mode='sub'>{TR('image_load_naming', { count: MAX_FILES })}</Text>

        <Flex gap={10} alignItems='center'>
            <input
                ref={fileRef}
                type='file'
                multiple
                accept={ACCEPT}
                onChange={handleFiles}
                style={{ display: 'none' }}
            />
            <Button
                type='button'
                mode='outline'
                icon='upload'
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                text={TR('image_load_files')}
            />
            {!!picked.length && <Text size='s'>{TR('image_load_picked', { count: picked.length })}</Text>}
        </Flex>

        {error && <Text size='s' mode='error'>{error}</Text>}

        <Flex gap={10}>
            <Button
                type='button'
                mode='outline'
                icon='search'
                disabled={!picked.length || busy}
                onClick={runCheck}
                text={TR('image_load_check')}
            />
            <Button
                type='button'
                icon='upload'
                disabled={!accepted.length || needsAlternatesOk || busy || finished}
                onClick={runUpload}
                text={TR('image_load_apply')}
            />
        </Flex>

        {report && <Flex col gap={6} className={styles.report}>
            <Flex gap={16} wrap>
                <Stat TR={TR} label='image_load_files_count' value={report.files} />
                <Stat TR={TR} label='image_load_barcodes' value={report.barcodes} />
                <Stat TR={TR} label='image_load_matched' value={report.matched} />
                <Stat TR={TR} label='image_load_uploaded' value={doneCount} />
                {!!failures && <Stat TR={TR} label='image_load_failed' value={failures} />}
            </Flex>

            {!!Object.keys(report.sources || {}).length && <Flex col gap={4}>
                <Text size='s' mode='sub'>{TR('image_load_current')}</Text>
                <Flex gap={16} wrap>
                    {Object.entries(report.sources).map(([source, count]) =>
                        <Stat key={source} TR={TR} label={SOURCE_TEXT[source] || source} value={count} />)}
                </Flex>
            </Flex>}

            {(busy || doneCount > 0) && <Text size='s'>{TR('image_load_progress', { done: doneCount, total })}</Text>}
            {!busy && <Text size='s' mode='sub'>
                {TR(applied ? 'image_load_applied_note' : 'image_load_dry_note')}
            </Text>}

            <RowList TR={TR} title='image_load_bad_names' rows={report.invalid} />
            <RowList TR={TR} title='image_load_conflicts' rows={report.conflicts} />
            <RowList TR={TR} title='image_load_unmatched' rows={report.unmatched} />

            {!!alternates.length && <Flex col gap={4} className={styles.list}>
                <Text size='s' bold>{TR('image_load_alternates')} ({alternates.length})</Text>
                <Text size='s' mode='sub'>{TR('image_load_alternates_hint')}</Text>
                {alternates.slice(0, LIST_LIMIT).map((row, i) =>
                    <Text key={`${row.barcode}-${i}`} size='s' className={styles.listRow}>
                        {row.barcode}{row.name ? ` — ${row.name}` : ''} ({row.count})
                    </Text>)}
                <Checkbox
                    checked={allowAlternates}
                    disabled={busy}
                    onChange={e => setAllowAlternates(e.target.checked)}
                >{TR('image_load_alternates_confirm')}</Checkbox>
            </Flex>}

            {!!fileStates.length && <Flex col gap={4} className={styles.list}>
                {fileStates.slice(0, LIST_LIMIT).map(([name, status], i) =>
                    <div key={`${name}-${i}`} className={styles.fileRow} data-state={status.state}>
                        <Text size='s'>{name}</Text>
                        <Text size='s' mode='sub'>
                            {TR(`image_load_state_${status.state}`)}
                            {status.reason ? ` — ${status.reason}` : ''}
                        </Text>
                    </div>)}
                {fileStates.length > LIST_LIMIT
                    && <Text size='s' mode='sub'>{TR('image_load_more', { count: fileStates.length - LIST_LIMIT })}</Text>}
            </Flex>}

            {!!failures && <Flex>
                <Button
                    type='button'
                    mode='text'
                    icon='csv'
                    onClick={exportFailures}
                    text={TR('image_load_download_failed')}
                />
            </Flex>}
        </Flex>}
    </Flex>
}
