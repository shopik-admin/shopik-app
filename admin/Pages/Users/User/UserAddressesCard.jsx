import apiReq from 'common/functions/apiReq'
import { useText } from 'common/texts/TextProvider'
import Text from 'common/components/Text'
import Button from 'common/components/Button'
import ConfirmButton from 'common/components/ConfirmButton'
import Flex from 'common/components/Flex'
import render from 'common/functions/render'
import { useModal } from 'common/components/Modal'
import InfoCard, { InfoRow } from 'components/Detail/InfoCard'
import AddressForm from './AddressForm'
import styles from './user.module.css'

function AddressRow({ userId, address, index, onChanged }) {
    const { TR } = useText()
    const { openModal } = useModal()

    function openEdit() {
        openModal(
            <AddressForm
                userId={userId}
                initialData={address}
                onDone={onChanged}
            />,
            { title: TR('edit-address-title') }
        )
    }

    async function setPrimary() {
        await apiReq('user/address/admin_active', { userId, addressId: address.addressId })
        await onChanged?.()
    }

    async function remove() {
        await apiReq('user/address/admin_remove', { userId, addressId: address.addressId })
        await onChanged?.()
    }

    return <div className={styles.addressRow}>
        <InfoRow
            icon='location'
            label={address.name || (address.active ? TR('address_primary') : `${TR('address_item')} #${index + 1}`)}
        >
            <Text size='m'>{render({ type: 'address', value: address })}</Text>
            {address.comment && <Text size='m' mode='sub'>{address.comment}</Text>}
        </InfoRow>
        <Flex gap={2} className={styles.addressActions}>
            {!address.active && <Button
                icon='check'
                mode='text'
                permission='user:update'
                title={TR('setActive')}
                tooltip={address.hasService === false ? TR('address_no_service') : undefined}
                disabled={address.hasService === false}
                onClick={setPrimary}
            />}
            <Button
                icon='edit'
                mode='text'
                permission='user:update'
                title={TR('action_edit')}
                onClick={openEdit}
            />
            <ConfirmButton
                icon='trash'
                mode='text'
                permission='user:update'
                title={TR('action_remove')}
                className={styles.removeBtn}
                q={TR('address_remove_confirm')}
                onOk={remove}
            />
        </Flex>
    </div>
}

export default function UserAddressesCard({ user, onChanged }) {
    const { TR } = useText()
    const { openModal } = useModal()
    const addresses = user.addresses || []

    function openAdd() {
        openModal(
            <AddressForm
                userId={user.id}
                onDone={onChanged}
            />,
            { title: TR('add-address-title') }
        )
    }

    return <InfoCard title={'user_addresses_title'}>
        {addresses.map((address, i) => <AddressRow
            key={address.addressId || i}
            userId={user.id}
            address={address}
            index={i}
            onChanged={onChanged}
        />)}
        <Button
            mode='text'
            icon='add'
            permission='user:update'
            onClick={openAdd}
        >{'address_add'}</Button>
    </InfoCard>
}
