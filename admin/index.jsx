import { ModalProvider } from 'common/components/Modal'
import ErrorBoundary from 'common/components/ErrorBoundary'
import TextProvider from 'common/texts/TextProvider'
import { BrowserRouter } from 'react-router'
import Lists from 'common/features/Lists'
import ReactDOM from 'react-dom/client'
import User from 'features/User'
import App from './App'

const sd = __SD__ || {}
delete window.__SD__

ReactDOM
    .createRoot(document.getElementById('root'))
    .render(
        <BrowserRouter>
            <ErrorBoundary>
            <TextProvider>
                <Lists sdLists={sd.lists}>
                    <User sdUser={sd.user}>
                        <ModalProvider>
                            <App />
                        </ModalProvider>
                    </User>
                </Lists>
            </TextProvider>
            </ErrorBoundary>
        </BrowserRouter>
    )