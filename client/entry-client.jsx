import { hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'

const sd = __SD__ || {}
delete window.__SD__

hydrateRoot(
    document.getElementById('root'),
    <BrowserRouter>
        <App data={sd} />
    </BrowserRouter>
)
