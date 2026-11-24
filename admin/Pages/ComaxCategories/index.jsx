import { useEffect, useMemo, useState } from 'react'
import apiReq from 'common/functions/apiReq'
import useApi from 'common/functions/useApi'
import Button from 'common/components/Button'
import Card from 'common/components/Card'
import Checkbox from 'common/components/Checkbox'
import Flex from 'common/components/Flex'
import Icon from 'common/components/Icon'
import Input from 'common/components/Input'
import Text from 'common/components/Text'
import { useText } from 'common/texts/TextProvider'
import usePermission from 'common/permissions/usePermision'
import classNames from 'common/functions/classNames'
import ProductPreview from './ProductPreview.jsx'
import styles from './comaxCategories.module.css'

const GLOBAL = 'global'

const LEVEL_KEY = {
    superDepartment: 'comax_category_level_super_department',
    department: 'comax_category_level_department',
    group: 'comax_category_level_group',
    subGroup: 'comax_category_level_sub_group',
    global: 'comax_category_level_global'
}

const LEVEL_TAG = {
    superDepartment: 'S',
    department: 'D',
    group: 'G',
    subGroup: 'SG',
    global: 'ALL'
}

function isOpen(expanded, path) {
    return expanded.has(path)
}

function TreeNode({ node, depth, expanded, onToggle, selectedPath, onSelect }) {
    const { TR } = useText()
    const open = isOpen(expanded, node.path)
    const hasChildren = node.children?.length > 0
    const rule = node.rule || {}

    return <div>
        <div
            className={classNames(styles.node, selectedPath === node.path && styles.selected)}
            style={{ paddingInlineStart: `${depth * 14 + 4}px` }}
            onClick={() => onSelect(node)}
        >
            {hasChildren
                ? <button
                    type='button'
                    className={styles.chevron}
                    onClick={event => {
                        event.stopPropagation()
                        onToggle(node.path)
                    }}
                >
                    <Icon
                        name='left'
                        className={classNames(styles.chevronIcon, [styles.chevronOpen, open])}
                    />
                </button>
                : <span className={styles.chevronPlaceholder} />}

            <span className={styles.levelTag}>{LEVEL_TAG[node.level] || node.level}</span>
            <span className={styles.nodeName}>{node.name}</span>
            <span className={styles.code}>{node.code}</span>

            {node.productCount > 0 && <span className={styles.badge}>{node.productCount}</span>}
            {(rule.requireKashrut || rule.hidden) && <span className={styles.nodeFlags}>
                {rule.requireKashrut && <span
                    className={styles.kashrutDot}
                    title={TR('comax_category_kashrut_required')}
                />}
                {rule.hidden && <span className={styles.flagHidden} title={TR('hidden')}>
                    <Icon name='x' />
                </span>}
            </span>}
            {rule.saleEnabled && <span className={styles.flagSale} title={TR('comax_category_by_sale')}>
                {rule.saleDays}
            </span>}
            {rule.stockEnabled && <span className={styles.flagStock} title={TR('comax_category_by_stock')}>
                {rule.minStock}
            </span>}
            {!!node.override && <span className={styles.overrideDot} title={TR('comax_category_overridden')} />}
        </div>

        {hasChildren && open && <div>
            {node.children.map(child => <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                selectedPath={selectedPath}
                onSelect={onSelect}
            />)}
        </div>}
    </div>
}

function withAncestors(node, byPath) {
    if (!node) return node
    // The tree response only carries each node's own code/name. The save
    // payload and the preview scope still need the whole chain, which is the
    // path segments plus the ancestor nodes already in the tree.
    const segments = String(node.path).split('/')
    const names = {}
    for (let index = 1; index <= segments.length; index++) {
        const ancestor = byPath.get(segments.slice(0, index).join('/'))
        if (ancestor) names[ancestor.level] = ancestor.name
    }
    return {
        ...node,
        superDepartmentCode: segments[0] || null,
        departmentCode: segments[1] || null,
        groupCode: segments[2] || null,
        subGroupCode: segments[3] || null,
        superDepartment: names.superDepartment || null,
        department: names.department || null,
        group: names.group || null,
        subGroup: names.subGroup || null,
        productCount: node.productCount ?? 0,
        inherited: !node.override
    }
}

function emptyForm(rule, override) {
    return {
        saleEnabled: rule?.saleEnabled !== false,
        saleDays: override?.saleDays ?? '',
        stockEnabled: rule?.stockEnabled !== false,
        minStock: override?.minStock ?? '',
        hidden: rule?.hidden === true,
        requireKashrut: rule?.requireKashrut === true
    }
}

export default function ComaxCategories() {
    const { data, loading, error, callReq } = useApi('comax_category/tree')
    const { TR } = useText()
    const canUpdate = usePermission('comax_product:update')

    const [selectedPath, setSelectedPath] = useState(GLOBAL)
    const [expanded, setExpanded] = useState(() => new Set())
    const [form, setForm] = useState(emptyForm())
    const [busy, setBusy] = useState(false)
    const [notice, setNotice] = useState('')
    const [revision, setRevision] = useState(0)

    const byPath = useMemo(() => {
        const map = new Map()
        const walk = nodes => {
            for (const node of nodes || []) {
                map.set(node.path, node)
                walk(node.children)
            }
        }
        walk(data?.tree)
        return map
    }, [data])

    const selectedNode = selectedPath === GLOBAL
        ? {
            path: GLOBAL,
            level: 'global',
            name: TR('comax_category_defaults'),
            code: '',
            rule: data?.global || {},
            override: data?.global?.override || null,
            inherited: !data?.global?.override,
            productCount: null,
            children: []
        }
        : byPath.get(selectedPath)

    const selected = selectedPath === GLOBAL
        ? selectedNode
        : withAncestors(selectedNode, byPath)

    useEffect(() => {
        if (selected) setForm(emptyForm(selected.rule, selected.override))
    }, [selectedPath, data]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (selectedPath === GLOBAL) return
        if (selected) return
        setSelectedPath(GLOBAL)
    }, [selectedPath, selected])

    function toggle(path) {
        setExpanded(current => {
            const next = new Set(current)
            if (next.has(path)) next.delete(path)
            else next.add(path)
            return next
        })
    }

    function change(key, value) {
        setForm(current => ({ ...current, [key]: value }))
    }

    const changes = useMemo(() => {
        if (!selected) return {}
        const rule = selected.rule || {}
        const override = selected.override || {}
        const payload = {}

        if (form.saleEnabled !== (rule.saleEnabled !== false)) payload.saleEnabled = form.saleEnabled
        if (String(form.saleDays) !== String(override.saleDays ?? ''))
            payload.saleDays = form.saleDays === '' ? null : Number(form.saleDays)
        if (form.stockEnabled !== (rule.stockEnabled !== false)) payload.stockEnabled = form.stockEnabled
        if (String(form.minStock) !== String(override.minStock ?? ''))
            payload.minStock = form.minStock === '' ? null : Number(form.minStock)
        if (form.hidden !== (rule.hidden === true)) payload.hidden = form.hidden
        if (form.requireKashrut !== (rule.requireKashrut === true))
            payload.requireKashrut = form.requireKashrut

        return payload
    }, [form, selected])

    const hasChanges = Object.keys(changes).length > 0

    async function save(clear = false) {
        if (!selected || !canUpdate) return
        setBusy(true)
        setNotice('')
        try {
            const payload = clear
                ? {
                    path: selected.path,
                    level: selected.level,
                    superDepartmentCode: selected.superDepartmentCode,
                    departmentCode: selected.departmentCode,
                    groupCode: selected.groupCode,
                    subGroupCode: selected.subGroupCode,
                    superDepartment: selected.superDepartment,
                    department: selected.department,
                    group: selected.group,
                    subGroup: selected.subGroup,
                    saleEnabled: null,
                    saleDays: null,
                    stockEnabled: null,
                    minStock: null,
                    hidden: null,
                    requireKashrut: null
                }
                : {
                    path: selected.path,
                    level: selected.level,
                    superDepartmentCode: selected.superDepartmentCode,
                    departmentCode: selected.departmentCode,
                    groupCode: selected.groupCode,
                    subGroupCode: selected.subGroupCode,
                    superDepartment: selected.superDepartment,
                    department: selected.department,
                    group: selected.group,
                    subGroup: selected.subGroup,
                    ...changes
                }

            if (!clear && !hasChanges) return
            const result = await apiReq('comax_category/update', payload)
            await callReq()
            setRevision(value => value + 1)
            if (result?.recomputeError) {
                setNotice(TR('comax_category_saved_recompute_error', {
                    error: result.recomputeError
                }))
            } else {
                setNotice(TR('comax_category_saved', {
                    hidden: result?.hidden ?? 0,
                    unhidden: result?.unhidden ?? 0,
                    stock: result?.stockChanged ?? 0
                }))
            }
        } catch (e) {
            setNotice(e?.message || String(e))
        } finally {
            setBusy(false)
        }
    }

    const roots = data?.tree || []
    const allPaths = [...byPath.keys()]

    return <Flex col gap={10} className={styles.page}>
        {notice && <Text className={styles.notice}>{notice}</Text>}

        <Flex gap={10} className={styles.body}>
            <Card className={styles.treePanel}>
                <Flex justifyContent='space-between' alignItems='center' className={styles.treeToolbar}>
                    <Text size='s' mode='sub'>
                        {TR('comax_category_tree_counts', {
                            categories: data?.categories ?? 0,
                            products: data?.products ?? 0
                        })}
                    </Text>
                    <Flex gap={6}>
                        <Button
                            icon='expand'
                            mode='text'
                            onClick={() => setExpanded(new Set(allPaths))}
                            disabled={!allPaths.length}
                        >
                            {TR('menu_categories_expand_all')}
                        </Button>
                        <Button
                            icon='collapse'
                            mode='text'
                            onClick={() => setExpanded(new Set())}
                            disabled={!expanded.size}
                        >
                            {TR('menu_categories_collapse_all')}
                        </Button>
                    </Flex>
                </Flex>

                {!data && loading
                    ? <Text>{TR('menu_categories_loading')}</Text>
                    : error
                        ? <Text mode='error'>{error?.message || String(error)}</Text>
                        : <div className={styles.tree}>
                            <div
                                className={classNames(styles.node, styles.globalNode, selectedPath === GLOBAL && styles.selected)}
                                onClick={() => setSelectedPath(GLOBAL)}
                            >
                                <span className={styles.chevronPlaceholder} />
                                <span className={styles.levelTag}>{LEVEL_TAG.global}</span>
                                <span className={styles.nodeName}>{TR('comax_category_defaults')}</span>
                                {!data?.global?.override && <span className={styles.inheritedTag}>
                                    {TR('comax_category_base_defaults')}
                                </span>}
                            </div>
                            {roots.map(node => <TreeNode
                                key={node.path}
                                node={node}
                                depth={0}
                                expanded={expanded}
                                onToggle={toggle}
                                selectedPath={selectedPath}
                                onSelect={node => setSelectedPath(node.path)}
                            />)}
                            {!roots.length && <Text size='s' mode='sub'>{TR('menu_categories_empty')}</Text>}
                        </div>}
            </Card>

            <Flex col gap={10} className={styles.detailColumn}>
                <Card className={styles.detailPanel}>
                    {!selected
                        ? <Text mode='sub'>{TR('menu_categories_select_hint')}</Text>
                        : <>
                            <Flex justifyContent='space-between' alignItems='start' gap={10}>
                                <div>
                                    <Text bold size='h3'>{selected.name}</Text>
                                    <Text size='s' mode='sub'>
                                        {selected.level === 'global'
                                            ? TR('comax_category_global_hint')
                                            : TR('comax_category_node_meta', {
                                                level: TR(LEVEL_KEY[selected.level]),
                                                code: selected.code
                                            })}
                                    </Text>
                                </div>
                                <Flex alignItems='center' gap={6}>
                                    <span className={selected.inherited ? styles.inheritedTag : styles.overrideTag}>
                                        {selected.level === 'global' && selected.inherited
                                            ? TR('comax_category_base_defaults')
                                            : selected.inherited
                                                ? TR('comax_category_inherited')
                                                : TR('comax_category_overridden')}
                                    </span>
                                <Button
                                    icon='info'
                                    mode='text'
                                    tooltip='comax_category_both_off_hint'
                                    tooltipPosition='bottom'
                                    tooltipAlign='left'
                                />
                                <Button
                                    icon={form.hidden ? 'eyeOff' : 'eye'}
                                    mode='text'
                                    tooltip={form.hidden ? 'comax_category_show' : 'comax_category_hidden'}
                                    tooltipPosition='bottom'
                                    disabled={busy || !canUpdate}
                                    onClick={() => change('hidden', !form.hidden)}
                                />
                            </Flex>
                        </Flex>

                        <div className={styles.gates}>
                            <div className={styles.gate}>
                                <div className={styles.gateControls}>
                                    <Flex alignItems='center' gap={8}>
                                        <Checkbox
                                            checked={form.saleEnabled}
                                            disabled={busy || !canUpdate}
                                            onChange={event => change('saleEnabled', event.target.checked)}
                                        >
                                            {TR('comax_category_by_sale')}
                                        </Checkbox>
                                    </Flex>
                                    <div className={styles.gateInput}>
                                        <Input
                                            aria-label={TR('comax_category_sale_days')}
                                            type='number'
                                            min={0}
                                            max={365}
                                            value={form.saleDays}
                                            placeholder={String(data?.global?.saleDays ?? 30)}
                                            disabled={busy || !canUpdate || !form.saleEnabled}
                                            onChange={event => change('saleDays', event.target.value)}
                                        />
                                    </div>
                                </div>
                                <Text size='s' mode='sub'>{TR('comax_category_sale_days_hint')}</Text>
                            </div>

                            <div className={styles.gate}>
                                <div className={styles.gateControls}>
                                    <Flex alignItems='center' gap={8}>
                                        <Checkbox
                                            checked={form.stockEnabled}
                                            disabled={busy || !canUpdate}
                                            onChange={event => change('stockEnabled', event.target.checked)}
                                        >
                                            {TR('comax_category_by_stock')}
                                        </Checkbox>
                                    </Flex>
                                    <div className={styles.gateInput}>
                                        <Input
                                            aria-label={TR('comax_category_min_stock')}
                                            type='number'
                                            min={0}
                                            value={form.minStock}
                                            placeholder={String(data?.global?.minStock ?? 0)}
                                            disabled={busy || !canUpdate || !form.stockEnabled}
                                            onChange={event => change('minStock', event.target.value)}
                                        />
                                    </div>
                                </div>
                                <Text size='s' mode='sub'>{TR('comax_category_min_stock_hint')}</Text>
                            </div>

                            <div className={classNames(styles.gate, styles.gateCheck)}>
                                <div className={styles.gateControls}>
                                    <Flex alignItems='center' gap={8}>
                                        <Checkbox
                                            checked={form.requireKashrut}
                                            disabled={busy || !canUpdate}
                                            onChange={event => change('requireKashrut', event.target.checked)}
                                        >
                                            {TR('comax_category_kashrut_required')}
                                        </Checkbox>
                                    </Flex>
                                </div>
                                <Text size='s' mode='sub'>{TR('comax_category_kashrut_hint')}</Text>
                            </div>
                        </div>

                        <Flex gap={8} className={styles.actions}>
                            <Button
                                icon='check'
                                loading={busy}
                                disabled={!canUpdate || !hasChanges}
                                onClick={() => save(false)}
                            >
                                {TR('save')}
                            </Button>
                            <Button
                                mode='text'
                                icon='refresh'
                                disabled={!canUpdate || !selected.override}
                                onClick={() => save(true)}
                            >
                                {TR('comax_category_reset')}
                            </Button>
                        </Flex>
                    </>}
                </Card>
                {data && selected && <ProductPreview
                    key={selected.path}
                    selected={selected}
                    revision={revision}
                />}
            </Flex>
        </Flex>
    </Flex>
}
