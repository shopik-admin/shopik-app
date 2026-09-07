import { hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import ErrorBoundary from 'common/components/ErrorBoundary'
import App from './App'

const sd = __SD__ || {}
delete window.__SD__

hydrateRoot(
    document.getElementById('root'),
    <BrowserRouter>
        <ErrorBoundary>
            <App data={sd} />
        </ErrorBoundary>
    </BrowserRouter>
)
