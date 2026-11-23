import { hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import ErrorBoundary from 'common/components/ErrorBoundary'
import { configureTexts } from 'common/texts/TR.js'
import App from './App'
import { registerServiceWorker } from 'common/functions/registerSW.js'

registerServiceWorker()

const sd = __SD__ || {}
window.__ENV__ = sd.env || {}
delete window.__SD__

configureTexts(sd.translations)

hydrateRoot(
    document.getElementById('root'),
    <BrowserRouter>
        <ErrorBoundary>
            <App data={sd} />
        </ErrorBoundary>
    </BrowserRouter>
)
