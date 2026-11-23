import Button from 'common/components/Button'
import { useSidebar } from 'Layout/Sidebar'
import styles from './header.module.css'
import PageTitle from '../PageTitle'
import Flex from '#common/components/Flex/index.jsx'
import UserInfo from '../UserInfo'
import NotificationBell from 'components/NotificationBell'
import LanguageSwitcher from '../LanguageSwitcher'

export default function Header({ }) {
    const { toggle } = useSidebar?.() || {}

    return <Flex tag='header' className={styles.header} alignItems='center' justifyContent='space-between'>
        <Flex alignItems='center' gap={20}>
            <Button icon='menu' onClick={toggle} mode='text' className={styles.menuButton} />
            <PageTitle />
        </Flex>
        <Flex alignItems='center' gap={8}>
            <NotificationBell />
            <LanguageSwitcher />
            <UserInfo />
        </Flex>
    </Flex>
}
