import { useState } from 'react'
import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Button from 'common/components/Button'
import Checkbox from 'common/components/Checkbox'
import ConfirmButton from 'common/components/ConfirmButton'
import Input from 'common/components/Input'
import apiReq from 'common/functions/apiReq'

export default function DevTools() {
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)
    const [refreshing, setRefreshing] = useState(false)
    const [syncResult, setSyncResult] = useState(null)
    const [syncError, setSyncError] = useState(null)
    const [syncing, setSyncing] = useState(false)
    const [gs1From, setGs1From] = useState('')
    const [gs1To, setGs1To] = useState('')
    const [gs1Force, setGs1Force] = useState(false)
    const [gs1SyncResult, setGs1SyncResult] = useState(null)
    const [gs1SyncError, setGs1SyncError] = useState(null)
    const [gs1Syncing, setGs1Syncing] = useState(false)
    const [gs1Barcode, setGs1Barcode] = useState('')
    const [gs1OnlyInStock, setGs1OnlyInStock] = useState(true)
    const [gs1Images, setGs1Images] = useState(false)
    const [gs1ForceImages, setGs1ForceImages] = useState(false)
    const [gs1ImageLimit, setGs1ImageLimit] = useState('')
    const [gs1EnrichResult, setGs1EnrichResult] = useState(null)
    const [gs1EnrichError, setGs1EnrichError] = useState(null)
    const [gs1Enriching, setGs1Enriching] = useState(false)
    const [gs1RunId, setGs1RunId] = useState('')
    const [gs1StatusResult, setGs1StatusResult] = useState(null)
    const [gs1StatusError, setGs1StatusError] = useState(null)
    const [gs1StatusLoading, setGs1StatusLoading] = useState(false)

    async function handleRefresh() {
        setError(null)
        setResult(null)
        setRefreshing(true)
        try {
            setResult(await apiReq('cache/reset', {}))
        } catch (e) {
            setError(e?.message || 'Refresh failed')
        } finally {
            setRefreshing(false)
        }
    }

    async function handleSyncStats() {
        setSyncError(null)
        setSyncResult(null)
        setSyncing(true)
        try {
            setSyncResult(await apiReq('user/sync_stats', {}))
        } catch (e) {
            setSyncError(e?.message || 'Sync failed')
        } finally {
            setSyncing(false)
        }
    }

    async function handleGs1Sync() {
        setGs1SyncError(null)
        setGs1SyncResult(null)
        setGs1Syncing(true)
        try {
            const payload = {}
            if (gs1From.trim()) payload.from = gs1From.trim()
            if (gs1To.trim()) payload.to = gs1To.trim()
            if (gs1Force) payload.force = true
            const res = await apiReq('gs1/sync', payload)
            setGs1SyncResult(res)
            if (res?.runId) setGs1RunId(res.runId)
        } catch (e) {
            setGs1SyncError(e?.message || 'GS1 sync failed')
        } finally {
            setGs1Syncing(false)
        }
    }

    async function handleGs1Enrich() {
        setGs1EnrichError(null)
        setGs1EnrichResult(null)
        setGs1Enriching(true)
        try {
            const payload = { onlyInStock: gs1OnlyInStock }
            if (gs1Images) payload.images = true
            if (gs1ForceImages) payload.forceImages = true
            if (gs1Barcode.trim()) payload.barcode = gs1Barcode.trim()
            const limit = Number(gs1ImageLimit)
            if (gs1ImageLimit !== '' && Number.isFinite(limit)) payload.imageLimit = limit
            const res = await apiReq('gs1/enrich', payload)
            setGs1EnrichResult(res)
            if (res?.runId) setGs1RunId(res.runId)
        } catch (e) {
            setGs1EnrichError(e?.message || 'GS1 enrich failed')
        } finally {
            setGs1Enriching(false)
        }
    }

    async function handleGs1Status() {
        setGs1StatusError(null)
        setGs1StatusResult(null)
        setGs1StatusLoading(true)
        try {
            const payload = {}
            if (gs1RunId.trim()) payload.runId = gs1RunId.trim()
            setGs1StatusResult(await apiReq('gs1/status', payload))
        } catch (e) {
            setGs1StatusError(e?.message || 'GS1 status failed')
        } finally {
            setGs1StatusLoading(false)
        }
    }

    const entries = result?.results || []

    return <Flex col gap={16} style={{ padding: 32, direction: 'ltr', textAlign: 'left' }}>
        <Card title="Cache" style={{ padding: 24 }}>
            <Flex col gap={16} style={{ padding: 8 }}>
                <Text>Delete the Redis cache and refill the hashsets from the database.</Text>
                <Flex>
                    <ConfirmButton
                        q="Refresh Redis cache? Cached data will be rebuilt from the database."
                        okText="Refresh"
                        onOk={handleRefresh}
                        icon="refresh"
                        loading={refreshing}
                        disabled={refreshing}
                    >
                        Redis Refresh
                    </ConfirmButton>
                </Flex>
                {error && <Text style={{ color: 'var(--text-error-primary)' }}>{error}</Text>}
                {!!entries.length && <Flex col gap={4}>
                    {entries.map(entry => <Text key={`${entry.model}:${entry.cacheName}`}>
                        {entry.model}: {entry.error
                            ? `error — ${entry.error}`
                            : `deleted ${entry.deletedKeys ?? 0}${entry.refilled != null ? `, refilled ${entry.refilled}` : ''}`}
                    </Text>)}
                </Flex>}
            </Flex>
        </Card>
        <Card title="User stats" style={{ padding: 24 }}>
            <Flex col gap={16} style={{ padding: 8 }}>
                <Text>Rebuild the user_stats collection from orders (single aggregation, chunked parallel upserts).</Text>
                <Flex>
                    <ConfirmButton
                        q="Rebuild user stats? Existing stats will be merged (upsert)."
                        okText="Sync"
                        onOk={handleSyncStats}
                        icon="refresh"
                        loading={syncing}
                        disabled={syncing}
                    >
                        Sync user stats
                    </ConfirmButton>
                </Flex>
                {syncError && <Text style={{ color: 'var(--text-error-primary)' }}>{syncError}</Text>}
                {syncResult && <Text>
                    users: {syncResult.users}, upserted: {syncResult.upserted}, modified: {syncResult.modified}, {syncResult.ms}ms
                    {syncResult.errors?.length ? ` — errors: ${syncResult.errors.join('; ')}` : ''}
                </Text>}
            </Flex>
        </Card>
        <Card title="GS1 sync" style={{ padding: 24 }}>
            <Flex col gap={16} style={{ padding: 8 }}>
                <Text>Enqueue a GS1 fetch run. Leave from/to empty for bootstrap on first run, watermark-resume afterwards.</Text>
                <Flex gap={12}>
                    <Input label="From (YYYY-MM-DD)" value={gs1From} onChange={e => setGs1From(e.target.value)} placeholder="2017-01-01" />
                    <Input label="To (YYYY-MM-DD)" value={gs1To} onChange={e => setGs1To(e.target.value)} placeholder="today" />
                </Flex>
                <Flex gap={8}>
                    <Checkbox checked={gs1Force} onChange={e => setGs1Force(e.target.checked)} label="force" />
                </Flex>
                <Flex>
                    <ConfirmButton
                        q="Start a GS1 sync run? This enqueues fetch jobs."
                        okText="Run"
                        onOk={handleGs1Sync}
                        icon="refresh"
                        loading={gs1Syncing}
                        disabled={gs1Syncing}
                    >
                        Run GS1 sync
                    </ConfirmButton>
                </Flex>
                {gs1SyncError && <Text style={{ color: 'var(--text-error-primary)' }}>{gs1SyncError}</Text>}
                {gs1SyncResult && <Text>
                    runId: {gs1SyncResult.runId}, total: {gs1SyncResult.total}, enqueued: {gs1SyncResult.enqueued}, {gs1SyncResult.from} → {gs1SyncResult.to}
                </Text>}
            </Flex>
        </Card>
        <Card title="GS1 enrich" style={{ padding: 24 }}>
            <Flex col gap={16} style={{ padding: 8 }}>
                <Text>Enrich products from local gs1_products, optionally launching image jobs. Barcode scopes to one product (deployed probes only — GS1 is IP-whitelisted). Repeat with imageLimit until queued=0 on large backfills.</Text>
                <Flex gap={12}>
                    <Input label="Barcode (single-product probe)" value={gs1Barcode} onChange={e => setGs1Barcode(e.target.value)} placeholder="empty = all" />
                    <Input label="Image limit (0 = all)" type="number" value={gs1ImageLimit} onChange={e => setGs1ImageLimit(e.target.value)} placeholder="0" />
                </Flex>
                <Flex gap={16}>
                    <Checkbox checked={gs1OnlyInStock} onChange={e => setGs1OnlyInStock(e.target.checked)} label="onlyInStock" />
                    <Checkbox checked={gs1Images} onChange={e => setGs1Images(e.target.checked)} label="images" />
                    <Checkbox checked={gs1ForceImages} onChange={e => setGs1ForceImages(e.target.checked)} label="forceImages" />
                </Flex>
                <Flex>
                    <ConfirmButton
                        q="Run GS1 enrich? This writes product data."
                        okText="Run"
                        onOk={handleGs1Enrich}
                        icon="refresh"
                        loading={gs1Enriching}
                        disabled={gs1Enriching}
                    >
                        Run GS1 enrich
                    </ConfirmButton>
                </Flex>
                {gs1EnrichError && <Text style={{ color: 'var(--text-error-primary)' }}>{gs1EnrichError}</Text>}
                {gs1EnrichResult && <Flex col gap={4}>
                    <Text>runId: {gs1EnrichResult.runId}</Text>
                    {gs1EnrichResult.texts && <Text>
                        texts — enriched: {gs1EnrichResult.texts.enriched}, skipped: {gs1EnrichResult.texts.skipped}, batches: {gs1EnrichResult.texts.batches}, rescued: {gs1EnrichResult.texts.rescued}
                    </Text>}
                    {gs1EnrichResult.images && <Text>
                        images — queued: {gs1EnrichResult.images.queued}, reused: {gs1EnrichResult.images.reused}, noZip: {gs1EnrichResult.images.noZip}, skipped: {gs1EnrichResult.images.skipped}
                    </Text>}
                </Flex>}
            </Flex>
        </Card>
        <Card title="GS1 status" style={{ padding: 24 }}>
            <Flex col gap={16} style={{ padding: 8 }}>
                <Text>Check a run state plus queue depths. RunId auto-fills after a sync/enrich run; omit it for queues only.</Text>
                <Flex gap={12}>
                    <Input label="RunId" value={gs1RunId} onChange={e => setGs1RunId(e.target.value)} placeholder="run:..." />
                </Flex>
                <Flex>
                    <Button icon="refresh" onClick={handleGs1Status} loading={gs1StatusLoading} disabled={gs1StatusLoading}>
                        Check status
                    </Button>
                </Flex>
                {gs1StatusError && <Text style={{ color: 'var(--text-error-primary)' }}>{gs1StatusError}</Text>}
                {gs1StatusResult && <Flex col gap={4}>
                    {gs1StatusResult.state
                        ? <Text>status: {gs1StatusResult.state.status}, processed: {gs1StatusResult.state.processed ?? 0}/{gs1StatusResult.state.total ?? 0}, failed: {gs1StatusResult.state.failed ?? 0}</Text>
                        : <Text>No run state (queues only).</Text>}
                    <Text>fetch: {JSON.stringify(gs1StatusResult.queues?.fetch ?? {})}</Text>
                    <Text>process: {JSON.stringify(gs1StatusResult.queues?.process ?? {})}</Text>
                </Flex>}
            </Flex>
        </Card>
    </Flex>
}
