import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import styles from './confirm.module.css'

export default function Confirm({ q, onOk, onCancel, okText = 'confirm', cancelText = 'cancel' }) {
    return <Flex col gap={30} className={styles.confirm}>
        {typeof q == 'string' ? <Text size='l' bold center>{q}</Text> : q}
        <Flex gap={20} center>
            <Button onClick={() => onOk?.()}>{okText}</Button>
            <Button mode='outline' onClick={() => onCancel?.()}>{cancelText}</Button>
        </Flex>
    </Flex>
}
