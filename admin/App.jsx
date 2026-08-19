import { Routes, Route, Navigate } from 'react-router'
//import BottomMenu from 'Layout/BottomMenu' 
import Sidebar from 'Layout/Sidebar'
import Header from 'Layout/Header'
import Main from 'Layout/Main'
import usePages from './Pages'

import 'common/styles/global.css'

function AdminLayout() {
    return <Sidebar >
        <Header />
        <Main />
        {/*  <BottomMenu /> */}
    </Sidebar>
}

export default function App() {
    const pages = usePages()
    return <Routes>
        <Route path='/admin' element={<AdminLayout />}>
            {pages.map((page) => (
                <Route key={page.key} path={page.path} Component={page.component} />
            ))}
        </Route>
        <Route path='*' element={<Navigate to='/admin/' replace />} />
    </Routes>
}
