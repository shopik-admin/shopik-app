import { useEffect, useState } from 'react'
import apiReq from 'common/functions/apiReq'
import Button from 'common/components/Button'
import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import Icon from 'common/components/Icon'
import Input from 'common/components/Input'
import Loader from 'common/components/Loader'
import Select from 'common/components/Select'
import Text from 'common/components/Text'
import { useText } from 'common/texts/TextProvider'
import classNames from 'common/functions/classNames'
import styles from './comaxCategories.module.css'

const PAGE_SIZE = 25

const INITIAL_QUERY = {
    search: '',
    storeIds: [],
    siteStatuses: [],
    hasImage: '',
    inGs1: '',
    kashrutValid: '',
    sort: 'sales',
    dir: -1,
    offset: 0
}

function Bool({ value, title }) {
    const { TR } = useText()
    return <span className={value ? styles.boolYes : styles.boolNo} title={title || undefined}>
        <Icon name={value ? 'check' : 'x'} />
        {value ? TR('yes') : TR('no')}
    </span>
}

function SortHeader({ field, label, sort, dir, onSort }) {
    const active = sort === field
    return <th className={styles.sortableTh} onClick={() => onSort(field)}>
        <Flex gap={4} alignItems='center'>
            {label}
            <Icon
                name={active ? (dir === 1 ? 'sortUp' : 'sortDown') : 'sort'}
                className={active ? undefined : styles.sortIdle}
            />
        </Flex>
    </th>
}

function scopeOf(selected) {
    return {
        level: selected?.level || 'global',
        superDepartmentCode: selected?.superDepartmentCode,
        departmentCode: selected?.departmentCode,
        groupCode: selected?.groupCode,
        subGroupCode: selected?.subGroupCode
    }
}

export default function ProductPreview({ selected, revision = 0 }) {
    const { TR } = useText()
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [query, setQuery] = useState(INITIAL_QUERY)
    const [searchText, setSearchText] = useState('')

    // Debounced search: typing should not fire a query per key. One character
    // is not a search yet — it clears the term so the table shows everything.
    useEffect(() => {
        const timer = setTimeout(() => {
            const next = searchText.trim().length >= 2 ? searchText : ''
            setQuery(current => current.search === next
                ? current
                : { ...current, search: next, offset: 0 })
        }, 300)
        return () => clearTimeout(timer)
    }, [searchText])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        apiReq('comax_category/products', {
            ...scopeOf(selected),
            ...query,
            limit: PAGE_SIZE
        })
            .then(result => {
                if (!cancelled) setData(result)
            })
            .catch(err => {
                if (!cancelled) setError(err)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => { cancelled = true }
    }, [query, revision]) // selected is fixed by the parent's key

    const total = data?.total || 0
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const page = Math.min(pages, Math.floor(query.offset / PAGE_SIZE) + 1)
    const rows = data?.rows || []
    const hasFilters = searchText.trim().length >= 2 ||
        query.storeIds.length > 0 ||
        query.siteStatuses.length > 0 ||
        !!query.hasImage ||
        !!query.inGs1 ||
        !!query.kashrutValid

    function patch(patch) {
        setQuery(current => ({ ...current, ...patch, offset: 0 }))
    }

    function go(nextPage) {
        setQuery(current => ({
            ...current,
            offset: Math.max(0, (nextPage - 1) * PAGE_SIZE)
        }))
    }

    function setSort(field) {
        setQuery(current => ({
            ...current,
            sort: field,
            dir: current.sort === field ? -current.dir : 1,
            offset: 0
        }))
    }

    function resetFilters() {
        setSearchText('')
        setQuery({ ...INITIAL_QUERY, storeIds: [], siteStatuses: [] })
    }

    // No "all" entry: clearing is the X on the selected chip, same as leaving
    // the filter out.
    const storeOptions = (data?.stores || []).map(store => ({
        value: store.id,
        text: store.name
    }))
    const statusOptions = [
        { value: 'active', text: TR('comax_category_status_active') },
        { value: 'hidden', text: TR('comax_category_status_hidden') },
        { value: 'archived', text: TR('comax_category_status_archived') }
    ]
    const boolOptions = (yesKey, noKey) => [
        { value: 'true', text: TR(yesKey) },
        { value: 'false', text: TR(noKey) }
    ]

    return <Card className={styles.productsPanel}>
        <Flex justifyContent='space-between' alignItems='center' className={styles.productsHeader}>
            <Flex alignItems='center' gap={8}>
                <Text bold>{TR('comax_category_products_title')}</Text>
                <span className={styles.productsCount}>
                    {TR('comax_category_products_total', { count: total })}
                </span>
            </Flex>
            <span className={styles.headerLoader} aria-hidden={!loading}>
                {loading && data ? <Loader size={16} /> : null}
            </span>
        </Flex>

        <Flex wrap gap={8} alignItems='center' className={styles.productsToolbar}>
            <Input
                className={styles.searchField}
                type='text'
                value={searchText}
                placeholder='comax_category_search_placeholder'
                aria-label={TR('comax_category_search_placeholder')}
                onChange={event => setSearchText(event.target.value)}
            />
            <Select
                className={styles.filterField}
                multi
                value={query.storeIds}
                options={storeOptions}
                placeholder={TR('comax_category_filter_store')}
                summary={values => TR('comax_category_stores_selected', { count: values.length })}
                aria-label={TR('comax_category_filter_store')}
                onChange={event => patch({ storeIds: event.target.value })}
            />
            <Select
                className={styles.filterField}
                multi
                value={query.siteStatuses}
                options={statusOptions}
                placeholder={TR('comax_category_col_status')}
                summary={values => TR('comax_category_statuses_selected', { count: values.length })}
                aria-label={TR('comax_category_col_status')}
                onChange={event => patch({ siteStatuses: event.target.value })}
            />
            <Select
                className={styles.filterField}
                value={query.hasImage}
                options={boolOptions(
                    'comax_category_filter_image_yes',
                    'comax_category_filter_image_no'
                )}
                placeholder={TR('comax_category_col_image')}
                toggleSelected
                aria-label={TR('comax_category_col_image')}
                onChange={event => patch({ hasImage: event.target.value })}
            />
            <Select
                className={styles.filterField}
                value={query.inGs1}
                options={boolOptions(
                    'comax_category_filter_gs1_yes',
                    'comax_category_filter_gs1_no'
                )}
                placeholder='GS1'
                toggleSelected
                aria-label='GS1'
                onChange={event => patch({ inGs1: event.target.value })}
            />
            <Select
                className={styles.filterField}
                value={query.kashrutValid}
                options={boolOptions(
                    'comax_category_filter_kashrut_yes',
                    'comax_category_filter_kashrut_no'
                )}
                placeholder={TR('comax_category_col_kashrut')}
                toggleSelected
                aria-label={TR('comax_category_col_kashrut')}
                onChange={event => patch({ kashrutValid: event.target.value })}
            />
            <Button
                mode='text'
                icon='refresh'
                disabled={!hasFilters}
                onClick={resetFilters}
            >
                {TR('comax_category_filter_reset')}
            </Button>
        </Flex>

        {error
            ? <Text mode='error'>{error?.message || String(error)}</Text>
            : !data && loading
                ? <Flex center className={styles.productsLoading}><Loader /></Flex>
                : rows.length === 0
                    ? <Text size='s' mode='sub'>{TR('comax_category_products_empty')}</Text>
                    : <div className={styles.productTableWrap}>
                        <table className={styles.productTable}>
                            <colgroup>
                                <col style={{ width: '16rem' }} />
                                <col style={{ width: '6.5rem' }} />
                                <col style={{ width: '20rem' }} />
                                <col style={{ width: '16rem' }} />
                                <col style={{ width: '5.5rem' }} />
                                <col style={{ width: '5rem' }} />
                                <col style={{ width: '6.5rem' }} />
                                <col style={{ width: '5.5rem' }} />
                                <col style={{ width: '6.5rem' }} />
                                <col style={{ width: '6.5rem' }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <SortHeader
                                        field='name'
                                        label={TR('comax_category_col_product')}
                                        sort={query.sort}
                                        dir={query.dir}
                                        onSort={setSort}
                                    />
                                    <SortHeader
                                        field='status'
                                        label={TR('comax_category_col_status')}
                                        sort={query.sort}
                                        dir={query.dir}
                                        onSort={setSort}
                                    />
                                    <th>{TR('comax_category_col_reason')}</th>
                                    <th>{TR('comax_category_col_stores')}</th>
                                    <SortHeader
                                        field='hasImage'
                                        label={TR('comax_category_col_image')}
                                        sort={query.sort}
                                        dir={query.dir}
                                        onSort={setSort}
                                    />
                                    <SortHeader
                                        field='inGs1'
                                        label='GS1'
                                        sort={query.sort}
                                        dir={query.dir}
                                        onSort={setSort}
                                    />
                                    <SortHeader
                                        field='kashrutValid'
                                        label={TR('comax_category_col_kashrut')}
                                        sort={query.sort}
                                        dir={query.dir}
                                        onSort={setSort}
                                    />
                                    <SortHeader
                                        field='sales'
                                        label={TR('comax_category_col_sales')}
                                        sort={query.sort}
                                        dir={query.dir}
                                        onSort={setSort}
                                    />
                                    <SortHeader
                                        field='salePrice'
                                        label={TR('comax_category_col_sale_price')}
                                        sort={query.sort}
                                        dir={query.dir}
                                        onSort={setSort}
                                    />
                                    <SortHeader
                                        field='buyingPrice'
                                        label={TR('comax_category_col_buying_price')}
                                        sort={query.sort}
                                        dir={query.dir}
                                        onSort={setSort}
                                    />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(row => {
                                    const inStock = row.stores?.filter(store => store.inStock) || []
                                    return <tr key={row.barcode}>
                                        <td className={styles.productNameCell}>
                                            <Text bold>{row.name || row.barcode}</Text>
                                            <Text size='s' mode='sub'>{row.barcode}</Text>
                                        </td>
                                        <td>
                                            <span className={classNames(
                                                styles.statusBadge,
                                                row.status === 'active' && styles.statusActive,
                                                row.status === 'hidden' && styles.statusHidden,
                                                row.status === 'archived' && styles.statusArchived
                                            )}>
                                                {row.statusText}
                                            </span>
                                        </td>
                                        <td className={styles.reasonCell}>{row.reason || '—'}</td>
                                        <td>
                                            {inStock.length
                                                ? <Flex gap={4} wrap>
                                                    {inStock.map(store => <span key={store.id} className={styles.storeChip}>
                                                        {store.name}
                                                    </span>)}
                                                </Flex>
                                                : <Text size='s' mode='sub'>{TR('comax_category_no_stores')}</Text>}
                                        </td>
                                        <td><Bool value={row.hasImage} /></td>
                                        <td>
                                            <Bool
                                                value={row.inGs1}
                                                title={row.gs1CheckedAt
                                                    ? `${TR('no')} (${row.gs1CheckedAt})`
                                                    : undefined}
                                            />
                                        </td>
                                        <td><Bool value={row.kashrutValid} /></td>
                                        <td className={styles.numberCell}>{row.unitsSold ?? ''}</td>
                                        <td className={styles.numberCell}>{row.salePrice ?? ''}</td>
                                        <td className={styles.numberCell}>{row.buyingPrice ?? ''}</td>
                                    </tr>
                                })}
                            </tbody>
                        </table>
                    </div>}

        {total > PAGE_SIZE && <Flex justifyContent='space-between' alignItems='center' className={styles.productsPager}>
            <Button
                mode='text'
                icon='right'
                disabled={loading || query.offset === 0}
                onClick={() => go(page - 1)}
            >
                {TR('comax_category_products_prev')}
            </Button>
            <Text size='s' mode='sub'>
                {TR('comax_category_products_page', { page, pages })}
            </Text>
            <Button
                mode='text'
                icon='left'
                disabled={loading || page >= pages}
                onClick={() => go(page + 1)}
            >
                {TR('comax_category_products_next')}
            </Button>
        </Flex>}
    </Card>
}
