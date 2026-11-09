import OrderProvider from 'features/Order/OrderProvider'
import { ModalProvider } from 'common/components/Modal'
import TextProvider from 'common/texts/TextProvider'
import { createContext, useContext, useEffect, useRef } from 'react'
import { Routes, Route, useLocation } from 'react-router'
import Lists from 'common/features/Lists'
import Header from 'layout/Header'
import User from 'features/User'
import Main from 'layout/Main'
import Footer from 'layout/Footer'
import CartProvider from 'layout/Cart/CartProvider'
import GlassixWidget from 'features/Glassix'
import ProductOverlay from 'layout/ProductOverlay'
import pages from './pages'
import styles from './App.module.css'

import 'common/styles/global.css'

const AppDataContext = createContext({})
export const useAppData = () => useContext(AppDataContext)

export default function App({ data = {} }) {
    const location = useLocation()
    const { pathname } = location
    // A product link followed inside the app keeps the page it came from as the
    // "background" location: the URL becomes the real product URL while the
    // router keeps rendering the previous page and shows the product on top.
    const backgroundLocation = location.state?.backgroundLocation
    const hideFooter = pathname === '/checkout' || pathname.startsWith('/checkout/')
    const prevLocation = useRef(location)

    useEffect(() => {
        const wasOverlay = !!prevLocation.current.state?.backgroundLocation
        const isOverlay = !!backgroundLocation
        // Opening/closing the product overlay must leave the page behind it
        // exactly where it was, so only real navigations reset the scroll.
        if (!wasOverlay && !isOverlay) window.scrollTo(0, 0)
        prevLocation.current = location
    }, [pathname, location.key])

    return <AppDataContext value={data}>
        <GlassixWidget />
        <TextProvider>
            <Lists sdLists={data.lists}>
                <OrderProvider>
                    <User sdUser={data.user}>
                        <ModalProvider>
                            <CartProvider>
                                <div className={styles.app}>
                                    <Header />
                                    <Main>
                                        <Routes location={backgroundLocation || location}>
                                            {pages.map(({
                                                path, element: Elm
                                            }) => <Route key={path} path={path} element={<Elm />} />)}
                                        </Routes>
                                    </Main>
                                    {!hideFooter && <Footer />}
                                    <ProductOverlay />
                                </div>
                            </CartProvider>
                        </ModalProvider>
                    </User>
                </OrderProvider>
            </Lists>
        </TextProvider>
    </AppDataContext>
}
