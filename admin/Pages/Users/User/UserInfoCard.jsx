import Text from 'common/components/Text'
import InfoCard, { InfoRow } from 'components/Detail/InfoCard'

export default function UserInfoCard({ user }) {
    const fullName = `${user.name?.first || ''} ${user.name?.last || ''}`.trim()

    return <InfoCard title={'user_details_title'}>
        {fullName && <InfoRow icon='person' label={fullName} />}
        {user.phone && <InfoRow icon='phone' label={'user_phone'}>
            <Text size='m' mode='sub' dir='ltr'>{user.phone}</Text>
        </InfoRow>}
        {user.secondPhone && <InfoRow icon='phone'>
            <Text size='m' mode='sub' dir='ltr'>{user.secondPhone}</Text>
        </InfoRow>}
        {user.email && <InfoRow icon='mail' label={'user_email'}>
            <Text size='m' mode='sub'>{user.email}</Text>
        </InfoRow>}
    </InfoCard>
}
