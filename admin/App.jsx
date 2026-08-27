import { Routes, Route, Navigate } from 'react-router'
//import BottomMenu from 'Layout/BottomMenu' 
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

function isOpsPath(path) {
    return path === '/admin/ops' || path?.startsWith('/admin/ops/')
}

export default function App() {
    const pages = usePages()
    const opsPages = pages.filter(p => isOpsPath(p.path))
    const otherPages = pages.filter(p => !isOpsPath(p.path))
    return <Routes>
        {opsPages.map((page) => (
            <Route key={page.key} path={page.path} Component={page.component} />
        ))}
        <Route element={<AdminLayout />}>
            {otherPages.map((page) => (
                <Route key={page.key} path={page.path} Component={page.component} />
            ))}
        </Route>
        <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
}
