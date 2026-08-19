import { Routes, Route, NavLink, useNavigate } from 'react-router'
import classNames from 'common/functions/classNames'
import PaymentMethods from './PaymentMethods'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import { useEffect } from 'react'

import styles from './account.module.css'
import { useUser } from 'features/User'
import Addresses from './Addresses'
import Overview from './Overview'
import Details from './Details'
import Orders from './Orders'

export default function Account({ onClose }) {
    const navigate = useNavigate()
    const user = useUser()
    const navItems = [
        { path: '/account', title: 'סקירה כללית', icon: 'user', exact: true },
        { path: '/account/orders', title: 'הזמנות', icon: 'orders' },
        { path: '/account/addresses', title: 'כתובות', icon: 'map' },
        { path: '/account/payment-methods', title: 'אמצעי תשלום', icon: 'card' },
        { path: '/account/details', title: 'פרטים אישיים', icon: 'person' },
    ]

    useEffect(() => {
        if (!user?.id)
            navigate('/')
    }, [user?.id])

    return (
        <div className={classNames(styles.container, onClose ? styles.inPopover : '')}>
            {!onClose && (
                <Text tag="h1" size="h2" bold style={{ marginBottom: 24 }}>אזור אישי</Text>
            )}

            <Flex gap={30} className={styles.layout} alignItems="start" justifyContent='center'>
                <nav className={styles.sidebar}>
                    <div className={styles.navList}>
                        {navItems.map(item => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                end={item.exact}
                                className={({ isActive }) =>
                                    classNames(styles.navLink, isActive ? styles.active : '')
                                }
                                onClick={onClose}
                            >
                                <Icon name={item.icon} className={styles.navIcon} />
                                <span>{item.title}</span>
                            </NavLink>
                        ))}
                    </div>

                    <div className={styles.logoutWrapper}>
                        <Button
                            icon='logout'
                            mode="outline"
                            className={styles.logoutButton}
                            onClick={async () => {
                                await user.logout()
                                onClose?.()
                            }}
                        >
                            התנתק
                        </Button>
                    </div>
                </nav>

                {onClose ? null : (
                    <div className={styles.content}>
                        <Routes>
                            <Route path="/" element={<Overview />} />
                            <Route path="/orders" element={<Orders />} />
                            <Route path="/addresses" element={<Addresses />} />
                            <Route path="/payment-methods" element={<PaymentMethods />} />
                            <Route path="/details" element={<Details />} />
                        </Routes>
                    </div>
                )}
            </Flex>
        </div>
    )
}
