import { AddressForm } from 'pages/Account/Addresses'
import Popover from 'common/components/Popover'
import Address from 'pages/Account/Addresses/Address'
import styles from './deliveryView.module.css'
import Button from 'common/components/Button'
import Title from '#common/components/Title'
import WindowOptions from '../WindowOptions'
import Flex from 'common/components/Flex'
import Tabs from 'common/components/Tabs'
import events from 'common/features/events'
import { useUser } from 'features/User'
import { useEffect, useState } from 'react'
import { useAppData } from 'App'
import Icon from '#common/components/Icon/index.jsx'
import Text from '#common/components/Text/index.jsx'
import { useOrder } from '../OrderProvider'
import { useText } from '#common/texts/TextProvider.jsx'


const deliveryMethods = {
    delivery: { text: 'delivery', icon: 'truck' },
    pickup: { text: 'pickup', icon: 'bag' }
}

export default function DeliveryView({ }) {
    const
        [deliveryMethod, setDeliveryMethod] = useState(deliveryMethods.delivery.text),
        [popoverOpened, setPopoverOpened] = useState(false),
        { icon, text } = deliveryMethods[deliveryMethod],
        { order = {} } = useOrder(),
        { addresses = [] } = useUser(),
        { TR } = useText(),
        window = order?.window,
        activeAddress = addresses.find(address => address.active),
        windowDate = new Date(window?.date),
        buttonTitle = window?.id ? `${TR(`day-${windowDate.getDay()}-short`)} | ${window.start} - ${window.end}` : text,
        buttonSubTitle = window?.id ? `${activeAddress?.street} ${activeAddress?.building}, ${activeAddress?.city}` : 'delivery_subTitle'

    function openPopover() {
        setPopoverOpened(true)
    }

    useEffect(() => {
        events.on('delivery-popover', openPopover)
        return () => events.off('delivery-popover', openPopover)
    }, [])

    return <Popover id='delivery' overlay button={<Flex alignItems='center' gap={10} className={styles.button} onClick={openPopover}>
        <Icon name={icon} className={styles.icon} />
        <Flex alignItems='center' justifyContent='space-between' grow={1}>
            <Flex col gap={3}>
                <Text bold size='s'>{buttonTitle}</Text>
                <Text size='xs'>{buttonSubTitle}</Text>
            </Flex>
            <Icon name='down' className={styles.chevron} />
        </Flex>
    </Flex>}>
        {() => <Flex col gap={25} className={styles.deliveryView}>
            <Tabs
                active={deliveryMethod}
                onChange={setDeliveryMethod}
                options={Object.values(deliveryMethods)}
            />
            {deliveryMethod == deliveryMethods.delivery.text ?
                <Delivery open={popoverOpened} /> : <Pickup />}
        </Flex>}
    </Popover>
}

function Delivery({ open }) {
    const { addresses = [] } = useUser()
    const activeAddress = addresses.find(({ active }) => active)

    if (!addresses.length)
        return <AddressForm />

    if (activeAddress || addresses.length == 1)
        return open ? <WindowOptions /> : null

    return <Addresses />
}

function Addresses() {
    const { addresses = [], onLogin } = useUser()

    async function select(address) {
        try {
            const res = await apiReq('user/address/active', { addressId: address.addressId })
            onLogin(res)
        } catch (err) {
            console.error(err)
        }
    }

    return <Flex col gap={15}>
        {addresses.map(address => <Address key={address.addressId} address={address} action={{
            text: 'select',
            onClick: () => select(address)
        }} />)}
        <Button onClick={() => { }}>add-address</Button>
    </Flex>
}

function Pickup() {
    return <Flex col gap={15}>
        {/* <Title subtitle='select-address-subtitle'>select-address-title</Title> */}
        <StoreSelector />
    </Flex>
}


function StoreSelector() {
    const { pickupStores } = useAppData()

    return <Flex col gap={15}>
        <Title subtitle='select-store-subtitle'>select-store-title</Title>
        {pickupStores.map(store => <Address key={store.storeId} store={store} action={{
            text: 'select',
            onClick: () => { }
        }} />)}
    </Flex>
}   
