import Button from 'common/components/Button'
import apiReq from 'common/functions/apiReq'
import styles from './addresses.module.css'
import Input from 'common/components/Input'
import Text from 'common/components/Text'
import Flex from 'common/components/Flex'
import Form from 'common/components/Form'
import { useUser } from 'features/User'
import { useState } from 'react'
import Address from './Address'
import Title from '#common/components/Title/index.jsx'
import { useOrder } from 'features/Order/OrderProvider'

export function AddressForm({ initialData, onDone }) {
    const [formState, setFormState] = useState()
    const { onLogin } = useUser()
    const { setOrder } = useOrder()

    function handleSubmit(data) {
        setFormState({ loading: true })

        const isEdit = !!initialData?.addressId
        if (isEdit) {
            data.addressId = initialData.addressId
        }
        const endpoint = isEdit ? 'user/address/edit' : 'user/address/add'

        apiReq(endpoint, data)
            .then(res => {
                onLogin(res?.user ? res : { user: res })
                if (res?.order) {
                    setOrder(res.order)
                }
                onDone?.()
            })
            .catch(error => {
                setFormState({ error: error?.message || String(error), loading: false })
            })
    }

    return (
        <Form action={handleSubmit} {...formState} submitText={initialData?.addressId ? 'עדכן כתובת' : 'הוסף כתובת'}>
            <Input name='city' required defaultValue={initialData?.city} />
            <Input name='street' required defaultValue={initialData?.street} />
            <Flex gap={16}>
                <Input name='building' required defaultValue={initialData?.building} />
                <Input name='apartment' defaultValue={initialData?.apartment} />
            </Flex>
            <Flex gap={16}>
                <Input name='floor' defaultValue={initialData?.floor} />
                <Input name='entrance' defaultValue={initialData?.entrance} />
            </Flex>
            <Input name='comment' placeholder={'addess-comment-placeholder'} type='textarea' rows={3} defaultValue={initialData?.notes} />
        </Form>
    )
}

export default function Addresses({ action }) {
    const user = useUser()
    const { setOrder } = useOrder()
    const [mode, setMode] = useState(action ? 'select' : 'browse')
    const [editAddress, setEditAddress] = useState(null)

    function handleAdd() {
        setMode('add')
        setEditAddress(null)
    }

    function handleEdit(address) {
        setMode('edit')
        setEditAddress(address)
    }

    async function setActive({ addressId }) {
        try {
            const res = await apiReq('user/address/active', { addressId })
            user.onLogin(res?.user ? res : { user: res })
        } catch (err) {
            console.error(err)
        }
    }

    async function handleRemove(address) {
        try {
            const res = await apiReq('user/address/remove', { addressId: address.addressId })
            user.onLogin(res?.user ? res : { user: res })
        } catch (err) {
            console.error(err)
        }
    }

    const addresses = user?.addresses || []
    if (['add', 'edit'].includes(mode))
        return <Flex col gap={16}>
            <Button icon='back' onClick={() => setMode(action ? 'select' : 'browse')} mode='text-brand' text='back' />
            <Title center={false} subtitle={mode == 'edit' ? 'edit-address-subtitle' : 'add-address-subtitle'}>{mode == 'edit' ? 'edit-address-title' : 'add-address-title'}</Title>
            <AddressForm initialData={editAddress} onDone={() => setMode(action ? 'select' : 'browse')} />
        </Flex>

    return (
        <Flex col gap={24}>
            <Title subtitle={'addresses-subtitle'}>addresses</Title>

            {addresses.length === 0 ? (
                <Text>no addresses yet</Text>
            ) : (
                <Flex col gap={16}>
                    {addresses.map((address) => <Address
                        key={address.addressId}
                        address={address}
                        onEdit={handleEdit}
                        onRemove={handleRemove}
                        action={{ onClick: () => setActive(address), text: 'setActive' }}
                    />)}
                </Flex>
            )}

            <Button onClick={handleAdd} >add address</Button>
        </Flex>
    )
}
