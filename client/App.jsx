import TextProvider from 'common/texts/TextProvider'
import Text from 'common/components/Text'
import { Outlet } from 'react-router'
import { Link } from 'react-router'
import Head from 'layout/Head'

export default function App() {
    return <div className='App'>
        client
        <TextProvider>
            {/* <Head /> */}
            <nav style={{ padding: '10px', gap: '10px', display: 'flex' }}>
                <Link to="/"><Text>Home - 2</Text></Link>
                <Link to="/products"><Text>Products</Text></Link>
            </nav>
            <main>
                <Outlet />
            </main>
        </TextProvider>
    </div>
}
