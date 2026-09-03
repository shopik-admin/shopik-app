import { Routes, Route, Navigate } from 'react-router'
import Sidebar from 'Layout/Sidebar'
import Header from 'Layout/Header'
import Main from 'Layout/Main'
import usePages from './Pages'

import 'common/styles/global.css'
import './styles/admin.css'

function AdminLayout() {
    return <Sidebar >
        <Header />
        <Main />
    </Sidebar>
}

export default function App() {
    const pages = usePages()
    return <Routes>
        <Route element={<AdminLayout />}>
            {pages.map((page) => (
                <Route key={page.key} path={page.path} Component={page.component} />
            ))}
        </Route>
        <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
}
