import { useState } from 'react'
import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import ConfirmButton from 'common/components/ConfirmButton'
import apiReq from 'common/functions/apiReq'

export default function DevTools() {
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)
    const [refreshing, setRefreshing] = useState(false)

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
    </Flex>
}
