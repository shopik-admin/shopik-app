import { ModalProvider } from 'common/components/Modal'
import TextProvider from 'common/texts/TextProvider'
import { registerIcons } from 'common/components/Icon'
import { adminIcons } from '../common/components/Icon/adminIcons.js'
import { BrowserRouter } from 'react-router'
import Lists from 'common/features/Lists'
import ReactDOM from 'react-dom/client'
import User from 'features/User'
import App from './App'

registerIcons(adminIcons)

const sd = __SD__ || {}
delete window.__SD__

ReactDOM
    .createRoot(document.getElementById('root'))
    .render(
        <BrowserRouter>
            <TextProvider>
                <Lists sdLists={sd.lists}>
                    <User sdUser={sd.user}>
                        <ModalProvider>
                            <App />
                        </ModalProvider>
                    </User>
                </Lists>
            </TextProvider>
        </BrowserRouter>
    )