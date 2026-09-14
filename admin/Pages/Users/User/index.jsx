import { useParams } from 'react-router'
import useApi from 'common/functions/useApi'
import { useText } from 'common/texts/TextProvider'
import render from 'common/functions/render'
import Loader from 'common/components/Loader'
import Text from 'common/components/Text'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import DetailPage, { StatsStrip } from 'components/Detail'
import detailStyles from 'components/Detail/detail.module.css'
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

    const { user, stats = {}, orders = [] } = data
    const fullName = `${user.name?.first || ''} ${user.name?.last || ''}`.trim() || user.phone || ''
    const ordersCount = Number(stats.ordersCount || 0)
    const netPaid = Number(stats.totalPaid || 0) - Number(stats.refundedTotal || 0)
    const coin = value => render({ type: 'coin', value })

    const labels = []
    const firstAt = stats.firstOrderAt || user.createdAt
    if (firstAt && Date.now() - new Date(firstAt).getTime() < 30 * 86400000)
        labels.push({ label: TR('new_customer') })
    if (ordersCount >= 3)
        labels.push({ label: TR('multi_orders') })

    return <DetailPage
        backFallback='/users'
        title={<Text size='h2' bold>{fullName}</Text>}
        labels={labels}
        actions={<Flex gap={8} wrap className={detailStyles.actionsBar}>
            <Button mode='outline' className={detailStyles.actionBtn} disabled title='phase_2'>{'action_edit'}</Button>
            <Button mode='outline' className={detailStyles.actionBtn} disabled title='phase_2'>{'user_update_status'}</Button>
        </Flex>}
        sidebar={<>
            <UserInfoCard user={user} />
            <UserAddressesCard user={user} />
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
