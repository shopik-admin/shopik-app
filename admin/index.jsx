import TextProvider from 'common/texts/TextProvider'
import { ModalProvider } from './Layout/Modal'
import { BrowserRouter } from 'react-router'
import ReactDOM from 'react-dom/client'
import User from 'features/User'
import App from './App'
import Lists from 'features/Lists'

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