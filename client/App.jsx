import OrderProvider from 'features/Order/OrderProvider'
import { ModalProvider } from 'common/components/Modal'
import TextProvider from 'common/texts/TextProvider'
import { createContext, useContext } from 'react'
import { Routes, Route } from 'react-router'
import Flex from 'common/components/Flex'
import Lists from 'common/features/Lists'
import Header from 'layout/Header'
import User from 'features/User'
import pages from './pages'

import 'common/styles/global.css'

const AppDataContext = createContext()
export const useAppData = () => useContext(AppDataContext)

export default function App({ data = {} }) {
    return <AppDataContext value={data}>
        <TextProvider>
            <Lists sdLists={data.lists}>
                <OrderProvider>
                    <User sdUser={data.user}>
                        <ModalProvider>
                            <Header />
                            <Flex justifyContent='space-between'>
                                <main>
                                    <Routes>
                                        {pages.map(({
                                            path, element: Elm
                                        }) => <Route key={path} path={path} element={<Elm />} />)}
                                    </Routes>
                                </main>
                            </Flex>
                        </ModalProvider>
                    </User>
                </OrderProvider>
            </Lists>
        </TextProvider>
    </AppDataContext>
}
