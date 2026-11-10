import { ModalProvider } from 'common/components/Modal'
import ErrorBoundary from 'common/components/ErrorBoundary'
import TextProvider from 'common/texts/TextProvider'
import { BrowserRouter } from 'react-router'
import Lists from 'common/features/Lists'
import ReactDOM from 'react-dom/client'
import User from 'features/User'
import Notifications from 'features/Notifications'
import App from './App'
import { registerServiceWorker } from 'common/functions/registerSW.js'

registerServiceWorker()

const sd = __SD__ || {}
window.__ENV__ = sd.env || {}
delete window.__SD__

ReactDOM
    .createRoot(document.getElementById('root'))
    .render(
        <BrowserRouter>
            <ErrorBoundary>
            <TextProvider>
                <Lists sdLists={sd.lists}>
                    <User sdUser={sd.user}>
                        <Notifications>
                            <ModalProvider>
                                <App />
                            </ModalProvider>
                        </Notifications>
                    </User>
                </Lists>
            </TextProvider>
            </ErrorBoundary>
        </BrowserRouter>
    )
