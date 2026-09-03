import Button from 'common/components/Button'
import { useSidebar } from 'Layout/Sidebar'
import styles from './header.module.css'
import ThemeToggle from 'components/ThemeToggle'
import PageTitle from '../PageTitle'
import Flex from '#common/components/Flex/index.jsx'
import UserInfo from '../UserInfo'

export default function Header({ }) {
    const { toggle, toggleMini } = useSidebar?.() || {}

    return <Flex tag='header' className={styles.header} alignItems='center' justifyContent='space-between'>
        <Flex alignItems='center' gap={20}>
            <Button icon='menu' onClick={toggle} mode='text' className={styles.menuButton} />
            <PageTitle />
            {/*  <Button onClick={toggleMini}>מיני</Button>
            <ThemeToggle /> */}
        </Flex>
        <UserInfo />
    </Flex>
}
