import { ModalProvider } from 'common/components/Modal'
import ErrorBoundary from 'common/components/ErrorBoundary'
import TextProvider from 'common/texts/TextProvider'
import { configureTexts, applyTextDirection } from 'common/texts/TR.js'
import { setCookie } from 'common/functions/cookies.js'
import apiReq from 'common/functions/apiReq.js'
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

// Set the direction before the first paint. The server already chose the
// language (user preference or the login-screen cookie), so this is only the
// client-side application of the same payload.
configureTexts(sd.translations)
applyTextDirection(sd.translations)

async function persistAdminLanguage(code) {
    setCookie('adminLang', code)
    await apiReq('admin/set_language', { languageCode: code })
}

ReactDOM
    .createRoot(document.getElementById('root'))
    .render(
        <BrowserRouter>
            <ErrorBoundary>
                <TextProvider
                    translations={sd.translations}
                    languages={sd.languages}
                    allowSwitch
                    onLanguageChange={persistAdminLanguage}
                >
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
