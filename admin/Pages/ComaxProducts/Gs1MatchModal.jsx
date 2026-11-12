import { useCallback, useEffect, useRef, useState } from 'react'
import apiReq from 'common/functions/apiReq'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import Input from 'common/components/Input'
import Loader from 'common/components/Loader'
import Text from 'common/components/Text'
import classNames from 'common/functions/classNames'
import { useText } from 'common/texts/TextProvider'
import { useNotifications } from 'features/Notifications'
import styles from './gs1Match.module.css'

function candidateLabel(candidate, TR) {
    if (candidate.missing) return TR('comax_gs1_missing_product')
    if (!candidate.inStock) return TR('comax_gs1_out_of_stock')
    return TR('comax_gs1_stores_count', { count: candidate.stores })
}

/**
 * Manual GS1 ↔ short-barcode matching.
 *
 * Only ambiguous GTINs are loaded: 2+ catalog shorts are valid suffixes, so the
 * matcher deliberately stops and asks. Picking a candidate (or typing another
 * short) and pressing Save & apply writes the manual mapping and runs the
 * single-barcode enrich immediately, so the product ends up with both Comax
 * and GS1 data.
 */
export default function Gs1MatchModal({ onClose }) {
    const { TR } = useText()
    const { refresh: refreshCounts } = useNotifications()
    const [rows, setRows] = useState([])
    const [total, setTotal] = useState(0)
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState()
    const [picks, setPicks] = useState({})
    const [saving, setSaving] = useState({})
    const [rowErrors, setRowErrors] = useState({})
    const reqId = useRef(0)

    const load = useCallback(async value => {
        const id = ++reqId.current
        setLoading(true)
        setError()
        try {
            const res = await apiReq('gs1/aliases', { status: 'ambiguous', limit: 200, search: value })
            if (id !== reqId.current) return
            setRows(res?.rows || [])
            setTotal(res?.total || 0)
        } catch (err) {
            if (id === reqId.current) setError(err)
        } finally {
            if (id === reqId.current) setLoading(false)
        }
    }, [])

    useEffect(() => {
        const timer = setTimeout(() => load(search), 300)
        return () => clearTimeout(timer)
    }, [search, load])

    useEffect(() => {
        refreshCounts?.()
    }, [refreshCounts])

    function setPick(barcode, short) {
        setPicks(prev => ({ ...prev, [barcode]: short }))
        setRowErrors(prev => ({ ...prev, [barcode]: '' }))
    }

    async function save(row) {
        const short = String(picks[row.barcode] || '').trim()
        if (!short || saving[row.barcode]) return
        setSaving(prev => ({ ...prev, [row.barcode]: true }))
        setRowErrors(prev => ({ ...prev, [row.barcode]: '' }))
        try {
            await apiReq('gs1/alias', { barcode: row.barcode, short, apply: true })
            setRows(prev => prev.filter(r => r.barcode !== row.barcode))
            setTotal(prev => Math.max(0, prev - 1))
            setPicks(prev => {
                const next = { ...prev }
                delete next[row.barcode]
                return next
            })
            refreshCounts?.()
        } catch (err) {
            setRowErrors(prev => ({ ...prev, [row.barcode]: err?.message || String(err) }))
        } finally {
            setSaving(prev => {
                const next = { ...prev }
                delete next[row.barcode]
                return next
            })
        }
    }

    return <Flex col gap={14} className={styles.modal}>
        <Flex gap={10} alignItems='end' justifyContent='space-between' wrap>
            <Input
                label='comax_gs1_search'
                icon='search'
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder='comax_gs1_search_placeholder'
                className={styles.search}
            />
            <Text size='s' mode='sub'>
                {TR('comax_gs1_pending', { count: total })}
            </Text>
        </Flex>

        <Text size='s' mode='sub'>comax_gs1_matches_hint</Text>

        {loading && !rows.length
            ? <Flex center style={{ padding: 32 }}><Loader /></Flex>
            : error
                ? <Text mode='error'>{error?.message || String(error)}</Text>
                : !rows.length
                    ? <Flex center className={styles.empty}>
                        <Text mode='sub'>{search ? TR('no_results') : 'comax_gs1_no_matches'}</Text>
                    </Flex>
                    : <Flex col gap={12} className={styles.list}>
                        {rows.map(row => {
                            const pick = picks[row.barcode] || ''
                            return <div key={row.barcode} className={styles.row}>
                                <Flex justifyContent='space-between' alignItems='start' gap={10}>
                                    <Flex col gap={2}>
                                        <Text bold className={styles.gtin}>{row.barcode}</Text>
                                        <Text size='s' mode='sub'>{row.name || '-'}</Text>
                                    </Flex>
                                    <Text size='xs' mode='sub'>{row.candidates.length} {TR('comax_gs1_candidates')}</Text>
                                </Flex>

                                <div className={styles.candidates}>
                                    {row.candidates.map(candidate => <button
                                        type='button'
                                        key={candidate.barcode}
                                        className={classNames(styles.candidate, [styles.selected, pick === candidate.barcode])}
                                        onClick={() => setPick(row.barcode, candidate.barcode)}
                                    >
                                        <Flex gap={8} alignItems='center'>
                                            {candidate.image
                                                ? <img src={candidate.image} alt='' className={styles.thumb} />
                                                : <div className={styles.thumbPlaceholder} />}
                                            <Flex col gap={1}>
                                                <Text bold size='s' className={styles.gtin}>{candidate.barcode}</Text>
                                                <Text size='s' ellipsis='1'>{candidate.name || '-'}</Text>
                                                <Text size='xs' mode={candidate.inStock ? 'sub' : 'error'}>
                                                    {candidateLabel(candidate, TR)}
                                                </Text>
                                            </Flex>
                                        </Flex>
                                    </button>)}
                                </div>

                                <Flex gap={10} alignItems='end' wrap>
                                    <Input
                                        label='comax_gs1_other_barcode'
                                        value={pick}
                                        placeholder='comax_gs1_other_barcode_hint'
                                        onChange={e => setPick(row.barcode, e.target.value)}
                                        className={styles.pickInput}
                                    />
                                    <Button
                                        mode='brand'
                                        icon='link'
                                        disabled={!pick}
                                        loading={!!saving[row.barcode]}
                                        onClick={() => save(row)}
                                    >comax_gs1_save_apply</Button>
                                </Flex>
                                {rowErrors[row.barcode]
                                    ? <Text size='s' mode='error'>{rowErrors[row.barcode]}</Text>
                                    : null}
                            </div>
                        })}
                    </Flex>}

        <Flex justifyContent='end'>
            <Button mode='outline' onClick={onClose}>close</Button>
        </Flex>
    </Flex>
}
