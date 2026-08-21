import { IoChevronDown } from 'react-icons/io5'
import classNames from 'common/functions/classNames'
import styles from './collapse.module.css'
import { useState } from 'react'
import Flex from 'common/components/Flex'

export default function Collapse({
    title,
    children,
    defaultOpen = true,
    open: controlledOpen,
    onToggle,
    className = '',
    headerClassName = '',
    contentClassName = '',
    showChevron = true
}) {
    const [internalOpen, setInternalOpen] = useState(defaultOpen)
    const isControlled = controlledOpen !== undefined
    const isOpen = isControlled ? controlledOpen : internalOpen

    const handleToggle = () => {
        if (!isControlled) {
            setInternalOpen(prev => !prev)
        }
        if (onToggle) {
            onToggle(!isOpen)
        }
    }

    return (
        <div className={classNames(styles.collapse, [styles.open, isOpen], className)}>
            <div className={classNames(styles.top, headerClassName)} onClick={handleToggle}>
                <Flex alignItems='center' justifyContent='space-between' width='100%'>
                    <div className={styles.titleContainer}>{title}</div>
                    {showChevron && <IoChevronDown className={styles.icon} />}
                </Flex>
            </div>
            <div className={styles.contentWrapper}>
                <div className={classNames(styles.children, contentClassName)}>
                    <div className={styles.innerContent}>
                        {children}
                    </div>
                </div>
            </div>
        </div>
    )
}
