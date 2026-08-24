import DeliveryView from 'features/Order/DeliveryView'
import UserView from 'features/User/UserView'
import MiniCart from 'layout/Cart/miniCart'
import Logo from 'common/components/Logo'
import styles from './header.module.css'
import MainMenu from 'layout/MainMenu'
import Search from 'layout/Search'
import Icon from 'common/components/Icon'
import classNames from 'common/functions/classNames'
import { useState, useEffect } from 'react'

export default function Header() {
    const [drawerOpen, setDrawerOpen] = useState(false)

    useEffect(() => {
        if (!drawerOpen) return
        const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false) }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [drawerOpen])

    return <header className={styles.header}>
        <button
            type="button"
            aria-label="menu"
            aria-expanded={drawerOpen}
            className={styles.menuBtn}
            onClick={() => setDrawerOpen(v => !v)}
        >
            <Icon name="menu" />
        </button>
        <div className={styles.logoWrap}>
            <Logo />
        </div>
        <div className={styles.searchWrap}>
            <Search />
        </div>
        <div className={styles.userDelivery}>
            <UserView />
            <DeliveryView />
        </div>
        <div className={styles.cartWrap}>
            <MiniCart />
        </div>
        <div className={classNames(styles.menuWrap, [styles.menuWrapOpen, drawerOpen])}>
            <MainMenu />
        </div>
        {drawerOpen && (
            <button
                type="button"
                aria-label="close menu"
                className={styles.backdrop}
                onClick={() => setDrawerOpen(false)}
            />
        )}
    </header>
}
