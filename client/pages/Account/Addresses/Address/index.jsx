import classNames from 'common/functions/classNames'
import styles from './address.module.css'
import mapImage from './map.png'
import Button from 'common/components/Button'
import Image from 'common/components/Image'
import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'

export default function Address({ store, address = {}, action = {}, onEdit, onRemove }) {
    const { city, street, apartment, building, active } = store?.address || address

    return <Flex
        onClick={action.onClick}
        tag={Card} gap={10} className={classNames(styles.address, [styles.active, active])}>
        <Image size={74} src={mapImage} />

        <Flex col gap={7} justifyContent='center'>
            <Text size='s'>{store ? 'store_address_title' : 'address_title'}</Text>
            <Text bold>{store?.name ? `${store.name} - ` : ''}{street} {building} {apartment && `דירה ${apartment}`}</Text>
            <Text bold>{city}</Text>
        </Flex>

        <Flex col justifyContent='space-between' grow={1}>
            {!store && <Flex gap={10} justifyContent='end' className={styles.buttons}>
                <Button icon='edit' mode='text' onClick={() => onEdit(address)} stopPropagation preventDefault />
                <Button icon='trash' mode='text' onClick={() => onRemove(address)} stopPropagation preventDefault />
            </Flex>}
            <Button {...action} mode='text' text={active ? 'active' : ''} className={styles.actionButton} />
        </Flex>
    </Flex>
}
