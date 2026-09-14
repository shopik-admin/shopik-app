import { useParams } from 'react-router'
import useApi from 'common/functions/useApi'
import { useText } from 'common/texts/TextProvider'
import render from 'common/functions/render'
import Loader from 'common/components/Loader'
import Text from 'common/components/Text'
import DetailPage, { StatsStrip } from 'components/Detail'
import UserActions from './UserActions'
import UserInfoCard from './UserInfoCard'
import UserAddressesCard from './UserAddressesCard'
import UserOrdersList from './UserOrdersList'

const dateFormatter = new Intl.DateTimeFormat('he', { day: 'numeric', month: 'numeric', year: 'numeric' })

const formatDate = value => {
    if (!value) return '-'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '-' : dateFormatter.format(date)
}

export default function User() {
    const { userId } = useParams()
    const { TR } = useText()
    const detailsApi = useApi('user/details', { id: userId })
    const { data, loading, error } = detailsApi

    if (loading) return <Loader />
    if (error) return <Text center mode='error'>{error.message}</Text>
    if (!data?.user) return <Text center mode='error'>{'user_not_found'}</Text>

    const refresh = async () => { await detailsApi.callReq() }

    const { user, stats = {}, orders = [] } = data
    const fullName = `${user.name?.first || ''} ${user.name?.last || ''}`.trim() || user.phone || ''
    const ordersCount = Number(stats.ordersCount || 0)
    const netPaid = Number(stats.totalPaid || 0) - Number(stats.refundedTotal || 0)
    const coin = value => render({ type: 'coin', value })

    const labels = []
    if (user.blocked)
        labels.push({ label: TR('user_blocked'), style: { backgroundColor: 'var(--danger-bg)', color: 'var(--danger-color)', iconName: 'x' } })
    const firstAt = stats.firstOrderAt || user.createdAt
    if (firstAt && Date.now() - new Date(firstAt).getTime() < 30 * 86400000)
        labels.push({ label: TR('new_customer') })
    if (ordersCount >= 3)
        labels.push({ label: TR('multi_orders') })

    return <DetailPage
        backFallback='/users'
        title={<Text size='h2' bold>{fullName}</Text>}
        labels={labels}
        actions={<UserActions user={user} onChanged={refresh} />}
        sidebar={<>
            <UserInfoCard user={user} />
            <UserAddressesCard user={user} onChanged={refresh} />
        </>}
    >
        <StatsStrip stats={[
            { icon: 'calendar', label: TR('stat_joined_at'), value: formatDate(user.createdAt) },
            { icon: 'bag', label: TR('stat_orders_count'), value: String(ordersCount) },
            { icon: 'card', label: TR('stat_total_paid'), value: coin(netPaid) },
            { icon: 'calculator', label: TR('stat_avg_order'), value: coin(ordersCount ? netPaid / ordersCount : 0) }
        ]} />
        <UserOrdersList orders={orders} />
    </DetailPage>
}
