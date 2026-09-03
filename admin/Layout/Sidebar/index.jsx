import { createContext, useContext, useState } from 'react'
import classNames from 'common/functions/classNames'
import ThemeToggle from 'components/ThemeToggle'
import Overlay from 'common/components/Overlay'
import DomainSelector from '../DomainSelector'
import Button from 'common/components/Button'
import styles from './sidebar.module.css'
import CompanyInfo from '../CompanyInfo'
import Text from 'common/components/Text'
import Flex from 'common/components/Flex'
import Menu from '../Menu'

const SidebarContext = createContext()
export const useSidebar = () => useContext(SidebarContext)

export default function Sidebar({ children }) {//TODO remember on refresh
    const
        [open, setOpen] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 650px)').matches ? false : true),
        [mini, setMini] = useState()

    function toggle() {
        setOpen(o => !o)
    }

    function toggleMini() {
        setMini(m => !m)
    }

    return <SidebarContext value={{ open, toggle, mini, toggleMini }}>
        <div className={classNames(styles.sidebar,
            [styles.open, open],
            [styles.close, !open],
            [styles.mini, mini]
        )}>
            <aside>
                <div className={styles.content}>
                    <CompanyInfo />
                    <DomainSelector />
                    <Menu />
                    <Flex alignItems='center' justifyContent={mini ? 'center' : 'space-between'} className={styles.footer}>
                        <Button icon={mini ? 'unMini' : 'toMini'} onClick={toggleMini} mode='text' />
                        {mini ? null : <>
                            <Text size='xs'>Powerd By Shopik</Text>
                            <ThemeToggle />
                        </>}
                    </Flex>
                </div>
            </aside>
            <Overlay onClick={toggle} open={open} className={styles.overlay} />
            {children}
        </div>
    </SidebarContext>
}
