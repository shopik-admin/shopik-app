import { useEffect, useMemo, useState } from 'react'
import useApi from 'common/functions/useApi'
import apiReq from 'common/functions/apiReq'
import Button from 'common/components/Button'
import ConfirmButton from 'common/components/ConfirmButton'
import Checkbox from 'common/components/Checkbox'
import Flex from 'common/components/Flex'
import Card from 'common/components/Card'
import Text from 'common/components/Text'
import Image from 'common/components/Image'
import Select from 'common/components/Select'
import { useModal } from 'common/components/Modal'
import { useText } from 'common/texts/TextProvider'
import { getDisplayImageUrl } from 'common/functions/displayImageUrl'
import BlockEditor from './BlockEditor'
import styles from './displayBlocks.module.css'

const PATH_PRESETS = [
    { value: '/', text: 'display_home' },
    { value: '/sales', text: 'display_sales_path' },
    { value: '/products', text: 'display_all_products' }
]

export default function DisplayBlocks() {
    const { openModal, closeModal } = useModal()
    const { TR } = useText()
    const { data: domains = [] } = useApi('domain/read', { limit: 0 })
    const [categories, setCategories] = useState([])
    const [domainId, setDomainId] = useState('')
    const [contextKind, setContextKind] = useState('path') // path | category
    const [path, setPath] = useState('/')
    const [categoryId, setCategoryId] = useState('')
    const [blocks, setBlocks] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState()
    const [dragIndex, setDragIndex] = useState(null)
    const [dropIndex, setDropIndex] = useState(null)

    useEffect(() => {
        apiReq('display_block/categories').then(setCategories).catch(() => {})
    }, [])

    useEffect(() => {
        if (!domainId && domains.length) {
            setDomainId(domains.find(d => d.isDefault)?.id || domains[0].id)
        }
    }, [domains, domainId])

    const placement = useMemo(() => {
        if (contextKind === 'category' && categoryId)
            return { type: 'category', categoryId }
        return { type: 'path', path }
    }, [contextKind, path, categoryId])

    const placementReady = placement.type === 'path' || !!placement.categoryId

    async function fetchBlocks() {
        if (!domainId || !placementReady) return
        setLoading(true)
        setError()
        try {
            const filter = placement.type === 'path'
                ? { domainId, 'placement.path': placement.path }
                : { domainId, 'placement.categoryId': placement.categoryId }
            const data = await apiReq('display_block/read', { filter, limit: 0, sort: { order: 1 } })
            setBlocks(Array.isArray(data) ? data : [])
        } catch (e) {
            setError(e?.message || TR('display_load_failed'))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchBlocks() }, [domainId, placement.type, placement.path, placement.categoryId])

    function openEditor(block) {
        openModal(
            <BlockEditor
                block={block}
                domainId={domainId}
                placement={placement}
                categories={categories}
                onClose={closeModal}
                onSaved={() => { closeModal(); fetchBlocks() }}
            />,
            { title: block ? `${block.name} — ${TR('edit')}` : TR('display_new_block') }
        )
    }

    async function handleDelete(block) {
        await apiReq('display_block/delete', { id: block.id })
        fetchBlocks()
    }

    async function handleToggleSub(block) {
        await apiReq('display_block/update', {
            id: block.id,
            placement: { ...block.placement, includeSubcategories: !block.placement?.includeSubcategories }
        })
        fetchBlocks()
    }

    async function handleDrop() {
        if (dragIndex == null || dropIndex == null || dragIndex === dropIndex) {
            setDragIndex(null); setDropIndex(null); return
        }
        const next = [...blocks]
        const [moved] = next.splice(dragIndex, 1)
        next.splice(dropIndex, 0, moved)
        setBlocks(next)
        setDragIndex(null); setDropIndex(null)
        try {
            await apiReq('display_block/reorder', {
                domainId,
                placement,
                orderedIds: next.map(b => b.id)
            })
        } catch (e) {
            setError(e?.message || TR('display_reorder_failed'))
            fetchBlocks()
        }
    }

    return <Flex col gap={12} className={styles.page}>
        <Card className={styles.contextBar}>
            <Flex gap={8} className={styles.contextRow}>
                <label className={styles.field}>
                    <Text size="s">display_domain</Text>
                    <Select
                        name="domain"
                        value={domainId}
                        onChange={e => setDomainId(e.target.value)}
                        options={domains.map(d => ({ value: d.id, text: d.name }))}
                    />
                </label>
                <label className={styles.field}>
                    <Text size="s">display_page</Text>
                    <Select
                        name="contextKind"
                        value={contextKind}
                        onChange={e => setContextKind(e.target.value)}
                        options={[
                            { value: 'path', text: 'display_path' },
                            { value: 'category', text: 'display_category' }
                        ]}
                    />
                </label>
                {contextKind === 'path'
                    ? <label className={styles.field}>
                        <Text size="s">display_path</Text>
                        <Select
                            name="path"
                            value={path}
                            onChange={e => setPath(e.target.value)}
                            options={PATH_PRESETS}
                        />
                    </label>
                    : <label className={styles.field}>
                        <Text size="s">display_category</Text>
                        <Select
                            name="category"
                            value={categoryId}
                            onChange={e => setCategoryId(e.target.value)}
                            options={[
                                { value: '', text: 'display_choose_category' },
                                ...categories.map(c => ({ value: c.id, text: c.path || c.name }))
                            ]}
                        />
                    </label>}
                <Button icon="add" onClick={() => openEditor(null)} disabled={!domainId || !placementReady}>
                    display_new_block
                </Button>
            </Flex>
        </Card>

        {error && <Text mode="error">{error}</Text>}
        {loading
            ? <Text>display_loading</Text>
            : !placementReady
                ? <Text>display_choose_hint</Text>
                : blocks.length === 0
                    ? <Text>display_no_blocks</Text>
                    : <div className={styles.list}>
                        {blocks.map((block, i) => (
                            <Card
                                key={block.id}
                                className={`${styles.row} ${dropIndex === i ? styles.dropTarget : ''}`}
                                draggable
                                onDragStart={() => setDragIndex(i)}
                                onDragOver={e => { e.preventDefault(); setDropIndex(i) }}
                                onDrop={handleDrop}
                                onDragEnd={() => { setDragIndex(null); setDropIndex(null) }}
                            >
                                <span className={styles.grip} title={TR('display_drag_hint')}>⠿</span>
                                <div className={styles.thumb}>
                                    {block.kind === 'banner' && block.banner?.slides?.[0]?.image
                                        ? <Image src={getDisplayImageUrl(block.banner.slides[0].image, 's')} />
                                        : <span className={styles.kindTag}>
                                            {block.kind === 'banner' ? `🖼 ${TR('display_banner')}` : `🛒 ${TR('display_carousel')}`}
                                        </span>}
                                </div>
                                <Flex col gap={2} className={styles.meta}>
                                    <Text bold>{block.name}{block.active === false ? ` ${TR('display_inactive')}` : ''}</Text>
                                    <Text size="s">{block.title || '—'}</Text>
                                    <Text size="s" mode="sub">
                                        {block.kind === 'banner'
                                            ? `${TR(block.banner?.layout === 'mosaic' ? 'display_layout_mosaic' : 'display_layout_carousel')} · ${block.banner?.slides?.length || 0}`
                                            : carouselSummary(block, TR)}
                                    </Text>
                                </Flex>
                                {block.placement?.type === 'category' && (
                                    <Checkbox
                                        label={TR('display_include_sub')}
                                        checked={!!block.placement?.includeSubcategories}
                                        onChange={handleToggleSub.bind(null, block)}
                                    />
                                )}
                                <Flex gap={4}>
                                    <Button size="s" icon="edit" mode="text" onClick={() => openEditor(block)} />
                                    <ConfirmButton
                                        size="s" icon="trash" mode="text"
                                        q={`${TR('display_delete_q')} "${block.name}"?`}
                                        onOk={() => handleDelete(block)}
                                    />
                                </Flex>
                            </Card>
                        ))}
                    </div>}
    </Flex>
}

function carouselSummary(block, TR) {
    const f = block.carousel?.filter || {}
    const parts = []
    if (f.categoryId) parts.push(TR('display_sum_category'))
    if (f.onSale) parts.push(TR('display_sum_onsale'))
    if (f.search) parts.push(`“${f.search}”`)
    if (f.barcodes?.length) parts.push(`${f.barcodes.length} ${TR('barcodes')}`)
    return parts.join(' · ') || TR('display_sum_all')
}
