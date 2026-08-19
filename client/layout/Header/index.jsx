import DeliveryView from 'features/Order/DeliveryView'
import UserView from 'features/User/UserView'
import Flex from 'common/components/Flex'
import Logo from 'common/components/Logo'
import styles from './header.module.css'
import MainMenu from 'layout/MainMenu'
import Search from 'layout/Search'
import Cart from 'layout/Cart'
import MiniCart from 'layout/Cart/miniCart'

export default function Header() {
    return <header className={styles.header}>
        <Flex alignItems='center' justifyContent='space-between' gap={20} className={styles.headerContent}>
            <Logo />
            <Search />
            <Flex center gap={10}>
                <UserView />
                <DeliveryView />
            </Flex>
            <MiniCart />
        </Flex>
        <MainMenu />
    </header>
}
