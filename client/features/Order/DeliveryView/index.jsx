import { AddressForm } from 'pages/Account/Addresses'
import Popover from 'common/components/Popover'
import Address from 'pages/Account/Addresses/Address'
import styles from './deliveryView.module.css'
import Button from 'common/components/Button'
import Title from '#common/components/Title'
import WindowOptions from '../WindowOptions'
import Flex from 'common/components/Flex'
import Loader from 'common/components/Loader'
import Tabs from 'common/components/Tabs'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import Form from 'common/components/Form'
import Input from 'common/components/Input'
import apiReq from '#common/functions/apiReq'
import { noServiceAddressFromSave, sortAddressesActiveFirst } from '#common/functions/address.js'
import openLoginPrompt from 'common/functions/openLoginPrompt'
import events from 'common/features/events'
import { useUser } from 'features/User'
import { useEffect, useState } from 'react'
import { useAppData } from 'App'
import { useOrder } from '../OrderProvider'
import { useText } from '#common/texts/TextProvider.jsx'
import HeaderPopoverButton from 'common/components/HeaderPopoverButton'
import useMediaQuery from 'common/functions/useMediaQuery'


const deliveryMethods = {
    delivery: { text: 'delivery', icon: 'truck' },
    pickup: { text: 'pickup', icon: 'bag' }
}

export default function DeliveryView({ }) {
    const
        { order = {}, setOrder } = useOrder(),
        { addresses = [], deliveryMethod: userMethod, onLogin, id: userId } = useUser(),
        { pickupStores = [] } = useAppData(),
        [deliveryMethod, setDeliveryMethod] = useState(userMethod == deliveryMethods.pickup.text ?
            deliveryMethods.pickup.text : deliveryMethods.delivery.text),
        [popoverOpened, setPopoverOpened] = useState(false),
        [isSwitching, setIsSwitching] = useState(false),
        // Matches the ≤768px mobile breakpoint in header.module.css
        isMobile = useMediaQuery('(max-width: 768px)'),
        { icon, text } = deliveryMethods[deliveryMethod],
        { TR } = useText(),
        window = order?.window,
        isPickup = order?.deliveryMethod == deliveryMethods.pickup.text,
        windowDate = new Date(window?.date),
        buttonTitle = window?.id ? `${TR(`day-${windowDate.getDay()}-short`)} | ${window.start} - ${window.end}` : text,
        buttonSubTitle = (() => {
            const activeAddress = addresses.find(a => a.active)
            const selectedStore = isPickup ? pickupStores?.find(s => s.id === order.storeId) : null
            const addr = isPickup ? (selectedStore?.address ?? order.address) : activeAddress
            const label = addr?.city ? `${[addr.street, addr.building].filter(Boolean).join(' ')}, ${addr.city}` : null
            if (window?.id) return label ?? 'delivery_subTitle'
            if (isPickup) return label ?? 'delivery_subTitle'
            return 'delivery_subTitle'
        })()

    async function handleDeliveryMethodChange(value) {
        const wantsDelivery = value === deliveryMethods.delivery.text
        const needsSwitch = wantsDelivery && order?.deliveryMethod === 'pickup'
        if (needsSwitch) setIsSwitching(true)
        setDeliveryMethod(value)
        // When switching to delivery while order is in pickup, sync server so
        // Delivery tab shows windows for the active address, not the pickup store.
        // Keep switching state until the server confirms, so WindowOptions
        // does not fetch options for the stale pickup store.
        if (needsSwitch) {
            try {
                const res = await apiReq('user/delivery_method', {})
                if (res?.order) setOrder(res.order)
                if (res?.user || res?.order) onLogin(res)
            } catch (err) {
                console.error(err)
            } finally {
                setIsSwitching(false)
            }
        }
    }

    function openPopover() {
        setPopoverOpened(true)
    }

    useEffect(() => {
        events.on('delivery-popover', openPopover)
        return () => events.off('delivery-popover', openPopover)
    }, [])

    return <Popover
        id='delivery'
        // Popover base gap is 5: total 8 desktop / 2 mobile
        topOffset={isMobile ? 4 : 10}
        overlay
        modal={false}
        button={<HeaderPopoverButton
            icon={icon}
            title={buttonTitle}
            subtitle={buttonSubTitle}
            onClick={openPopover}
        />}
    >
        {() => <Flex col gap={25} className={styles.deliveryView}>
            {!userId ? <GuestPrompt /> : <>
                {pickupStores.length ? <Tabs
                    active={deliveryMethod}
                    onChange={handleDeliveryMethodChange}
                    options={Object.values(deliveryMethods)}
                /> : null}
                {isSwitching ? <Loader /> : deliveryMethod == deliveryMethods.delivery.text ?
                    <Delivery open={popoverOpened} /> : <Pickup />}
            </>}
        </Flex>}
    </Popover>
}

function GuestPrompt() {
    const { TR } = useText() || {}

    return <Flex col center gap={14} className={styles.guestPrompt}>
        <Icon name='user' className={styles.guestIcon} />
        <Text bold size='xl' center>{TR?.('login_required_delivery_title')}</Text>
        <Text mode='sub' center>{TR?.('login_required_delivery_subtitle')}</Text>
        <Button onClick={openLoginPrompt}>{TR?.('login')}</Button>
    </Flex>
}

function Delivery({ open }) {
    const { addresses = [] } = useUser()
    const [isEditing, setIsEditing] = useState(false)
    const [noServiceAddress, setNoServiceAddress] = useState(null)
    // "Back" from the no-service screen: keeps the screen from trapping the
    // shopper when every saved address is outside the service area.
    const [showAddressList, setShowAddressList] = useState(false)
    const activeAddress = addresses.find(({ active }) => active)
    const allNoService = !activeAddress && addresses.length > 0 &&
        addresses.every(address => address.hasService === false)
    const displayedNoService = noServiceAddress || (allNoService ? addresses[addresses.length - 1] : null)

    function handleNoService(address) {
        setNoServiceAddress(address || null)
        setShowAddressList(false)
    }

    // AddressForm reports the full server response. Only a saved address with
    // hasService === false should open the no-service screen; treating a whole
    // response object as an address made in-service addresses show it too.
    function handleAddressSaved(res) {
        handleNoService(noServiceAddressFromSave(res))
    }

    if (!addresses.length)
        return <AddressForm onDone={handleAddressSaved} />

    if (displayedNoService && !showAddressList)
        return <NoServiceView
            address={displayedNoService}
            onBack={() => setShowAddressList(true)}
        />

    if (isEditing) return <Flex col gap={15}>
        <Button mode="text" onClick={() => setIsEditing(false)}>cancel</Button>
        <Addresses onDone={() => setIsEditing(false)} onNoService={handleNoService} />
    </Flex>

    if (activeAddress) {
        return open
            ? <WindowOptions onChangeAddress={() => setIsEditing(true)} />
            : null
    }

    return <Addresses onNoService={handleNoService} />
}

function NoServiceView({ address, onBack }) {
    const { TR } = useText() || {}
    const { email } = useUser()
    const [formState, setFormState] = useState()
    const [done, setDone] = useState(false)

    async function handleSubmit(data) {
        setFormState({ loading: true })
        try {
            await apiReq('supply_area/notify', {
                email: data.email,
                address: {
                    city: address?.city,
                    street: address?.street,
                    building: address?.building,
                    apartment: address?.apartment,
                    areaId: address?.areaId,
                    location: address?.location
                }
            })
            setDone(true)
            setFormState({ loading: false })
        } catch (error) {
            setFormState({ error: error?.message || String(error), loading: false })
            throw error
        }
    }

    return <Flex col gap={12}>
        <Form
            action={handleSubmit}
            {...formState}
            submitText='no_service_area_submit'
            noSubmit={done}
            autoComplete='off'
        >
            <Flex col center gap={16} className={styles.noServiceView}>
                <Icon name='home' className={styles.noServiceIcon} />
                <Text bold size='xl' center>{TR?.('no_service_area_title')}</Text>
                <Text mode='sub' center>{TR?.('no_service_area_subtitle')}</Text>
                {done
                    ? <Text bold center className={styles.noServiceSuccess}>
                        {TR?.('no_service_area_success')}
                    </Text>
                    : <Input
                        name='email'
                        type='email'
                        required
                        label=''
                        placeholder='no_service_area_email_placeholder'
                        defaultValue={email || ''}
                        className={styles.noServiceEmail}
                    />}
            </Flex>
        </Form>
        <Flex center>
            <Button type='button' mode='text-brand' onClick={onBack}>
                {TR?.('no_service_area_back')}
            </Button>
        </Flex>
    </Flex>
}

function Addresses({ onDone, onNoService }) {
    const { addresses = [], onLogin } = useUser()
    const { setOrder } = useOrder()
    const [mode, setMode] = useState(null)
    const [editAddress, setEditAddress] = useState(null)
    const sortedAddresses = sortAddressesActiveFirst(addresses)

    async function select(address) {
        try {
            const res = await apiReq('user/address/active', { addressId: address.addressId })
            onLogin(res)
            if (res?.order) setOrder(res.order)
            onNoService?.(null)
            onDone?.()
        } catch (err) {
            console.error(err)
        }
    }

    async function handleRemove(address) {
        try {
            const res = await apiReq('user/address/remove', { addressId: address.addressId })
            onLogin(res?.user ? res : { user: res })
            if (res?.order) setOrder(res.order)
        } catch (err) {
            console.error(err)
        }
    }

    function handleEdit(address) {
        setEditAddress(address)
        setMode('edit')
    }

    function handleAdd() {
        setEditAddress(null)
        setMode('add')
    }

    if (mode === 'add' || mode === 'edit') {
        return <Flex col gap={15}>
            <Button icon='back' mode='text-brand' text='back' onClick={() => setMode(null)} />
            <AddressForm initialData={editAddress} onDone={(res) => {
                onNoService?.(noServiceAddressFromSave(res))
                setMode(null)
                setEditAddress(null)
            }} />
        </Flex>
    }

    return <Flex col gap={15}>
        <Flex col gap={15} className={styles.addressList}>
            {sortedAddresses.map(address => {
                const disabled = address.hasService === false
                return <Address key={address.addressId} address={address} onEdit={handleEdit} onRemove={handleRemove} action={{
                    text: 'select',
                    onClick: () => select(address),
                    disabled
                }} />
            })}
        </Flex>
        <Button onClick={handleAdd}>add-address</Button>
    </Flex>
}

function Pickup() {
    const { order = {} } = useOrder()
    const [isEditing, setIsEditing] = useState(false)
    const hasPickupStore = order?.deliveryMethod === 'pickup' && !!order.storeId

    useEffect(() => {
        if (!hasPickupStore) setIsEditing(false)
    }, [hasPickupStore])

    if (hasPickupStore && !isEditing) {
        return <WindowOptions onChangeStore={() => setIsEditing(true)} />
    }
    return <Flex col gap={15}>
        {hasPickupStore && (
            <Button mode="text" onClick={() => setIsEditing(false)}>cancel</Button>
        )}
        <StoreSelector onDone={() => setIsEditing(false)} />
    </Flex>
}


function StoreSelector({ onDone }) {
    const { pickupStores } = useAppData()
    const { onLogin, deliveryMethod: userMethod } = useUser()
    const { order = {}, setOrder } = useOrder()

    async function select(store) {
        try {
            const res = await apiReq('user/delivery_method', { pickupStoreId: store.id })
            if (res?.order) setOrder(res.order)
            if (res?.user || res?.order) onLogin(res)
            onDone?.()
        } catch (err) {
            console.error(err)
        }
    }

    return <Flex col gap={15}>
        <Title subtitle='select-store-subtitle'>select-store-title</Title>
        {pickupStores.map(store => <Address key={store.id} store={store}
            active={userMethod == 'pickup' && order.storeId === store.id}
            action={{
                text: 'select',
                onClick: () => select(store)
            }} />)}
    </Flex>
}   
