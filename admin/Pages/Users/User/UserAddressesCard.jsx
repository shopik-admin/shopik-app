import Text from 'common/components/Text'
import render from 'common/functions/render'
import { useText } from 'common/texts/TextProvider'
import InfoCard, { InfoRow } from 'components/Detail/InfoCard'

export default function UserAddressesCard({ user }) {
    const { TR } = useText()
    const addresses = user.addresses || []
    if (!addresses.length) return null

    return <InfoCard title={'user_addresses_title'}>
        {addresses.map((address, i) => <InfoRow
            key={address.addressId || i}
            icon='location'
            label={address.name || (address.active ? TR('address_primary') : `${TR('address_item')} #${i + 1}`)}
        >
            <Text size='m'>{render({ type: 'address', value: address })}</Text>
            {address.comment && <Text size='m' mode='sub'>{address.comment}</Text>}
        </InfoRow>)}
    </InfoCard>
}
