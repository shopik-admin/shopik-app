import { useState } from 'react'
import apiReq from 'common/functions/apiReq'
import Button from 'common/components/Button'
import Checkbox from 'common/components/Checkbox'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Image from 'common/components/Image'
import Input from 'common/components/Input'
import DateRangeCalendar from 'common/components/DateRangeCalendar'
import { useText } from 'common/texts/TextProvider'
import { getDisplayImageUrl } from 'common/functions/displayImageUrl'
import styles from './displayBlocks.module.css'

const SORT_OPTIONS = [
    { value: 'default', text: 'display_sort_default' },
    { value: 'newest', text: 'display_sort_newest' },
    { value: 'popular', text: 'display_sort_popular' }
]

// Stable per-row ids so SlideRow local state (typed URL, upload indicator)
// doesn't jump rows on reorder/delete. Local uniqueness is enough — the GCS
// path already includes the block id, so no crypto needed.
let slideSeq = 0
function newSlideKey() {
    return `slide-${Date.now().toString(36)}-${(slideSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

// Split an ISO datetime into local date + time parts for the calendar/time inputs.
function splitLocal(iso) {
    if (!iso) return { date: '', time: '' }
    try {
        const d = new Date(iso)
        if (isNaN(d)) return { date: '', time: '' }
        const pad = n => String(n).padStart(2, '0')
        return {
            date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
            time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
        }
    } catch { return { date: '', time: '' } }
}

export default function BlockEditor({ block, domainId, domainName, placement, categories = [], allCategories = [], onClose, onSaved }) {
    const { TR } = useText()
    const [kind, setKind] = useState(block?.kind || 'banner')
    const [name, setName] = useState(block?.name || '')
    const [title, setTitle] = useState(block?.title || '')
    const [active, setActive] = useState(block?.active !== false)
    const initialStart = splitLocal(block?.schedule?.start)
    const initialEnd = splitLocal(block?.schedule?.end)
    const [startDate, setStartDate] = useState(initialStart.date)
    const [startTime, setStartTime] = useState(initialStart.time || '00:00')
    const [endDate, setEndDate] = useState(initialEnd.date)
    const [endTime, setEndTime] = useState(initialEnd.time || '00:00')
    const [layout, setLayout] = useState(block?.banner?.layout || 'carousel')
    const [bannerAutoplay, setBannerAutoplay] = useState(block?.banner?.autoplaySec ?? 5)
    const [slides, setSlides] = useState(() =>
        (block?.banner?.slides || []).map(s => ({ key: newSlideKey(), ...s })))
    const [carouselCategory, setCarouselCategory] = useState(block?.carousel?.filter?.categoryId || '')
    const [onSale, setOnSale] = useState(!!block?.carousel?.filter?.onSale)
    const [search, setSearch] = useState(block?.carousel?.filter?.search || '')
    const [barcodes, setBarcodes] = useState((block?.carousel?.filter?.barcodes || []).join('\n'))
    const [sort, setSort] = useState(
        typeof block?.carousel?.sort === 'string' ? block.carousel.sort : 'default')
    const [limit, setLimit] = useState(block?.carousel?.limit || 20)
    const [carouselAutoplay, setCarouselAutoplay] = useState(block?.carousel?.autoplaySec || 0)
    const [showAll, setShowAll] = useState(block?.carousel?.showAll !== false)
    const [showAllText, setShowAllText] = useState(block?.carousel?.showAllText || '')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState()

    async function save() {
        if (!name.trim()) { setError(TR('display_name_required')); return }
        setSaving(true)
        setError()
        try {
            const payload = {
                name: name.trim(),
                // Only carousels have a shopper-facing title.
                ...(kind === 'product_carousel' ? { title: title.trim() } : {}),
                active,
                schedule: {
                    ...(startDate ? { start: new Date(`${startDate}T${startTime || '00:00'}`).toISOString() } : {}),
                    ...(endDate ? { end: new Date(`${endDate}T${endTime || '00:00'}`).toISOString() } : {})
                }
            }
            if (kind === 'banner') {
                payload.banner = {
                    layout,
                    autoplaySec: Number(bannerAutoplay) || 0,
                    slides: slides.map(s => ({
                        ...(s.key ? { key: s.key } : {}),
                        ...(s.image ? { image: s.image } : {}),
                        ...(s.mobileImage ? { mobileImage: s.mobileImage } : {}),
                        ...(s.link ? { link: s.link } : {}),
                        ...(s.alt ? { alt: s.alt } : {})
                    }))
                }
            } else {
                payload.carousel = {
                    filter: {
                        ...(carouselCategory ? { categoryId: carouselCategory } : {}),
                        ...(onSale ? { onSale: true } : {}),
                        ...(search.trim() ? { search: search.trim() } : {}),
                        ...parseBarcodes(barcodes)
                    },
                    sort,
                    limit: Math.min(Math.max(Number(limit) || 20, 1), 100),
                    autoplaySec: Number(carouselAutoplay) || 0,
                    showAll,
                    ...(showAllText.trim() ? { showAllText: showAllText.trim() } : {})
                }
            }
            if (block?.id) {
                await apiReq('display_block/update', { id: block.id, kind, ...payload })
            } else {
                await apiReq('display_block/create', {
                    kind, domainId, placement, ...payload
                })
            }
            onSaved()
        } catch (e) {
            setError(e?.message || TR('display_save_failed'))
        } finally {
            setSaving(false)
        }
    }

    return <Flex col gap={10} className={styles.editor}>
        <Flex gap={10} justifyContent='space-between'>
            <span className={styles.checkRow}>
                <Checkbox label={TR('active')} checked={active} onChange={e => setActive(e.target.checked)} />
            </span>
            <Text size="s" mode="sub">
                {TR('display_domain')}: {domainName || domainId}
                {' · '}{TR('display_placement')}: {placement.type === 'path'
                    ? placement.path
                    : (allCategories.find(c => c.id === placement.categoryId)?.path || placement.categoryId)}
            </Text>
        </Flex>
        <Flex gap={8}>
            <Input
                type="select"
                name="kind"
                label="kind"
                className={styles.field}
                value={kind}
                onChange={e => setKind(e.target.value)}
                disabled={!!block}
                options={[
                    { value: 'banner', text: 'display_banner' },
                    { value: 'product_carousel', text: 'display_product_carousel' }
                ]}
            />
            <Input
                name="name"
                label="display_admin_name"
                className={styles.field}
                required
                defaultValue={name}
                onChange={e => setName(e.target.value)}
                placeholder="display_name_ph"
            />
        </Flex>
        <Flex gap={8}>
            {kind === 'product_carousel' && <Input
                name="title"
                label="display_block_title"
                className={styles.field}
                defaultValue={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="display_title_ph"
            />}
        </Flex>
        <Flex col gap={6}>
            <Text size="s">display_schedule</Text>
            <DateRangeCalendar
                value={{
                    ...(startDate ? { $gte: startDate } : {}),
                    ...(endDate ? { $lte: endDate } : {})
                }}
                onChange={next => {
                    setStartDate(next?.$gte || '')
                    setEndDate(next?.$lte || '')
                }}
            />
            <Flex gap={8}>
                <Input
                    type="time"
                    name="startTime"
                    label="display_start_time"
                    className={styles.field}
                    defaultValue={startDate ? startTime : ''}
                    onChange={e => setStartTime(e.target.value)}
                />
                <Input
                    type="time"
                    name="endTime"
                    label="display_end_time"
                    className={styles.field}
                    defaultValue={endDate ? endTime : ''}
                    onChange={e => setEndTime(e.target.value)}
                />
            </Flex>
        </Flex>

        {kind === 'banner'
            ? <BannerFields
                layout={layout} setLayout={setLayout}
                autoplay={bannerAutoplay} setAutoplay={setBannerAutoplay}
                slides={slides} setSlides={setSlides}
                blockId={block?.id}
            />
            : <CarouselFields
                categories={categories}
                allCategories={allCategories}
                category={carouselCategory} setCategory={setCarouselCategory}
                onSale={onSale} setOnSale={setOnSale}
                search={search} setSearch={setSearch}
                barcodes={barcodes} setBarcodes={setBarcodes}
                sort={sort} setSort={setSort}
                limit={limit} setLimit={setLimit}
                autoplay={carouselAutoplay} setAutoplay={setCarouselAutoplay}
                showAll={showAll} setShowAll={setShowAll}
                showAllText={showAllText} setShowAllText={setShowAllText}
            />}

        {error && <Text mode="error">{error}</Text>}
        <Flex gap={8}>
            <Button onClick={save} loading={saving}>Save</Button>
            <Button mode="text" onClick={onClose}>Cancel</Button>
        </Flex>
    </Flex>
}

function parseBarcodes(text) {
    const list = String(text || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
    return list.length ? { barcodes: list } : {}
}

function BannerFields({ layout, setLayout, autoplay, setAutoplay, slides, setSlides, blockId }) {
    function patchSlide(i, patch) {
        setSlides(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
    }
    function moveSlide(i, dir) {
        setSlides(prev => {
            const j = i + dir
            if (j < 0 || j >= prev.length) return prev
            const next = [...prev]
            const [s] = next.splice(i, 1)
            next.splice(j, 0, s)
            return next
        })
    }
    return <Flex col gap={8}>
        <Flex gap={8}>
            <Input
                type="select"
                name="layout"
                label="display_layout"
                className={styles.field}
                value={layout}
                onChange={e => setLayout(e.target.value)}
                options={[
                    { value: 'carousel', text: 'display_layout_carousel' },
                    { value: 'mosaic', text: 'display_layout_mosaic' }
                ]}
            />
            {layout === 'carousel' && <Input
                type="number"
                name="autoplay"
                label="display_autoplay"
                className={styles.field}
                min="0"
                defaultValue={autoplay}
                onChange={e => setAutoplay(e.target.value)}
            />}
        </Flex>
        {slides.map((slide, i) => (
            <SlideRow
                key={slide.key || `new-${i}`}
                slide={slide}
                index={i}
                blockId={blockId}
                onPatch={patch => patchSlide(i, patch)}
                onMove={dir => moveSlide(i, dir)}
                onRemove={() => setSlides(prev => prev.filter((_, idx) => idx !== i))}
            />
        ))}
        <Button size="s" icon="add" onClick={() => setSlides(prev => [...prev, { key: newSlideKey() }])}>
            display_add_slide
        </Button>
    </Flex>
}

function SlideRow({ slide, index, blockId, onPatch, onMove, onRemove }) {
    const { TR } = useText()
    const [url, setUrl] = useState('')
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState()

    async function uploadBase(basePath, base64) {
        setUploading(true)
        setError()
        try {
            const res = await apiReq('display_block/upload_image', {
                imageBase64: base64,
                ...(blockId ? { blockId, slideKey: slide.key || `slide-${index}` } : {})
            })
            onPatch({ [basePath]: res.basePath })
        } catch (e) {
            setError(e?.message || TR('display_upload_failed'))
        } finally {
            setUploading(false)
        }
    }

    function handleFile(e, basePath) {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
            const dataUrl = String(reader.result || '')
            uploadBase(basePath, dataUrl.split(',')[1] || '')
        }
        reader.readAsDataURL(file)
        e.target.value = ''
    }

    async function handleUrl(basePath) {
        if (!url.trim()) return
        setUploading(true)
        setError()
        try {
            const res = await apiReq('display_block/upload_image', {
                sourceUrl: url.trim(),
                ...(blockId ? { blockId, slideKey: slide.key || `slide-${index}` } : {})
            })
            onPatch({ [basePath]: res.basePath })
            setUrl('')
        } catch (e) {
            setError(e?.message || TR('display_fetch_failed'))
        } finally {
            setUploading(false)
        }
    }

    return <div className={styles.slide}>
        <Image src={getDisplayImageUrl(slide.image, 's')} className={styles.slidePreview} />
        <Flex col gap={6} className={styles.slideFields}>
            <Flex gap={6}>
                <label className={styles.fileBtn}>
                    {uploading ? TR('display_uploading') : TR('display_upload_file')}
                    <input type="file" accept="image/*" hidden
                        disabled={uploading}
                        onChange={e => handleFile(e, 'image')} />
                </label>
                <Input
                    name={`slide-url-${index}`}
                    label=""
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="display_paste_url"
                />
                <Button size="s" onClick={() => handleUrl('image')} loading={uploading}>display_fetch</Button>
            </Flex>
            <Flex gap={6}>
                <label className={styles.fileBtn}>
                    {TR('display_mobile_file')}
                    <input type="file" accept="image/*" hidden
                        disabled={uploading}
                        onChange={e => handleFile(e, 'mobileImage')} />
                </label>
                {slide.mobileImage && <Text size="s" mode="sub">display_mobile_ok</Text>}
                <Input
                    name={`slide-link-${index}`}
                    label=""
                    defaultValue={slide.link || ''}
                    onChange={e => onPatch({ link: e.target.value })}
                    placeholder="display_link_ph"
                />
                <Input
                    name={`slide-alt-${index}`}
                    label=""
                    defaultValue={slide.alt || ''}
                    onChange={e => onPatch({ alt: e.target.value })}
                    placeholder="display_alt_ph"
                />
            </Flex>
            {error && <Text size="s" mode="error">{error}</Text>}
        </Flex>
        <Flex col gap={4}>
            <Button size="s" mode="text" onClick={() => onMove(-1)}>↑</Button>
            <Button size="s" mode="text" onClick={() => onMove(1)}>↓</Button>
            <Button size="s" icon="trash" mode="text" onClick={onRemove} />
        </Flex>
    </div>
}

function CarouselFields(props) {
    const { TR } = useText()
    const {
        categories, allCategories = [], category, setCategory,
        onSale, setOnSale, search, setSearch,
        barcodes, setBarcodes, sort, setSort,
        limit, setLimit, autoplay, setAutoplay,
        showAll, setShowAll, showAllText, setShowAllText
    } = props
    // Preserve a deeper category chosen before the two-level limit (or via API)
    // so editing never silently wipes it.
    const missingCategory = category && !categories.some(c => c.id === category)
        ? [{
            value: category,
            text: allCategories.find(c => c.id === category)?.path || category
        }]
        : []
    return <Flex col gap={8}>
        <Flex gap={8}>
            <Input
                type="select"
                name="category"
                label="display_category"
                className={styles.field}
                value={category}
                onChange={e => setCategory(e.target.value)}
                options={[
                    { value: '', text: 'display_all' },
                    ...categories.map(c => ({ value: c.id, text: c.path || c.name })),
                    ...missingCategory
                ]}
            />
            <Input
                type="select"
                name="sort"
                label="display_sort"
                className={styles.field}
                value={sort}
                onChange={e => setSort(e.target.value)}
                options={SORT_OPTIONS}
            />
        </Flex>
        <Flex gap={8}>
            <Input
                name="search"
                label="display_search_text"
                className={styles.field}
                defaultValue={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="display_search_ph"
            />
            <Input
                type="number"
                name="limit"
                label="display_max_products"
                className={styles.field}
                min="1"
                max="100"
                defaultValue={limit}
                onChange={e => setLimit(e.target.value)}
            />
        </Flex>
        <Input
            type="textarea"
            name="barcodes"
            label="display_barcodes_label"
            className={styles.field}
            style={{ borderRadius: '20px' }}
            rows={3}
            defaultValue={barcodes}
            onChange={e => setBarcodes(e.target.value)}
            placeholder={'7290000123456\n7290000654321'}
        />
        <Flex gap={12}>
            <Checkbox label={TR('display_on_sale')} checked={onSale} onChange={e => setOnSale(e.target.checked)} />
            <Checkbox label={TR('display_show_all')} checked={showAll} onChange={e => setShowAll(e.target.checked)} />
        </Flex>
        {showAll && <Input
            name="showAllText"
            label="display_show_all_text"
            className={styles.field}
            defaultValue={showAllText}
            onChange={e => setShowAllText(e.target.value)}
            placeholder="display_show_all_ph"
        />}
        <Input
            type="number"
            name="carouselAutoplay"
            label="display_autoscroll"
            className={styles.field}
            min="0"
            defaultValue={autoplay}
            onChange={e => setAutoplay(e.target.value)}
        />
    </Flex>
}
