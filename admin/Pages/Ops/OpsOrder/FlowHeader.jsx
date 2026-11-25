import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Button from 'common/components/Button'
import styles from './flowHeader.module.css'

/**
 * One header for every screen of the pick/replacement flow: back on the
 * physical right (inner screens only), centred title, close on the physical
 * left. The modal's own close button is hidden for this flow so there is only
 * ever one X and the three items sit on the same line.
 */
export default function FlowHeader({ title, onBack, onClose }) {
    return <Flex alignItems='center' className={styles.header}>
        {onBack
            ? <Button mode='text' icon='back' onClick={onBack} className={styles.sideBtn} aria-label='back' />
            : <span className={styles.side} aria-hidden />}
        <Text size='m' bold className={styles.title}>{title}</Text>
        <Button mode='text' icon='x' onClick={onClose} className={styles.sideBtn} aria-label='close' />
    </Flex>
}
