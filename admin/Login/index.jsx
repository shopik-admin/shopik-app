import ReactDOM from 'react-dom/client'
import styles from './login.module.css'

import 'common/styles/global.css'
import '../styles/admin.css'

import TextProvider from 'common/texts/TextProvider.jsx'
import { applyTextDirection, configureTexts } from 'common/texts/TR.js'
import { setCookie } from 'common/functions/cookies.js'
import ErrorBoundary from 'common/components/ErrorBoundary'
import DigitsInput from 'common/components/DigitsInput'
import ThemeToggle from 'components/ThemeToggle'
import apiReq from 'common/functions/apiReq.js'
import Input from 'common/components/Input'
import Button from 'common/components/Button'
import Form from 'common/components/Form'
import Text from 'common/components/Text'
import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import { useState } from 'react'
import Logo from '#common/components/Logo/index.jsx'
import { registerServiceWorker } from 'common/functions/registerSW.js'
import LanguageSwitcher from 'Layout/LanguageSwitcher'

registerServiceWorker()

const sd = (typeof __SD__ !== 'undefined' && __SD__) || {}
window.__ENV__ = sd.env || {}
try { delete window.__SD__ } catch { }

configureTexts(sd.translations)
applyTextDirection(sd.translations)

function persistLoginLanguage(code) {
    setCookie('adminLang', code)
    try { sessionStorage.setItem('adminLangPending', code) } catch { }
}

function pendingLanguage() {
    try { return sessionStorage.getItem('adminLangPending') } catch { return null }
}

function clearPendingLanguage() {
    try { sessionStorage.removeItem('adminLangPending') } catch { }
}

ReactDOM
    .createRoot(document.getElementById('root'))
    .render(<TextProvider
        translations={sd.translations}
        languages={sd.languages}
        allowSwitch
        onLanguageChange={persistLoginLanguage}
    >
        <ErrorBoundary>
            <Login />
        </ErrorBoundary>
    </TextProvider>)


export default function Login() {
    const
        [formState, setFormState] = useState({}),
        [idNum, setIdNum] = useState()

    async function finishLogin() {
        // A language chosen on the login screen is an explicit request to make
        // it the account's language. Without it, the account preference wins.
        const pending = pendingLanguage()
        if (pending) {
            try { await apiReq('admin/set_language', { languageCode: pending }) } catch { }
            clearPendingLanguage()
        }
        location.reload()
    }

    function submit(vals) {
        setFormState({ loading: true })

        if (idNum) vals = { ...vals, ...idNum }

        apiReq(`admin/login${idNum ? '' : '_otp'}`, vals)
            .then(async ({ token }) => {
                if (idNum) {
                    await finishLogin()
                }
                else {
                    setIdNum({ otpToken: token, idNum: vals.idNum })
                    setFormState({})
                }
            })
            .catch(error => setFormState({ error: error.message }))
    }

    return <Flex center col className={styles.login}>

        <Card className={styles.card}>
            <Text size='h1' bold>login_title</Text>
            <Text className={styles.subTitle}>login_subTitle</Text>

            <Form
                submitText='login_submitButton'
                {...formState}
                action={submit}
            >
                {!idNum ?
                    <Input
                        required
                        name='idNum'
                        type='idNum'
                        autoComplete='off'
                        info='idNum_input_description'
                        placeholder='idNum_placeholder'
                    /> :
                    <Flex col gap={15}>
                        <Flex justify='between' align='center'>
                            <Button type='button' mode='text' icon='back' onClick={() => setIdNum(null)}>back</Button>
                        </Flex>
                        <DigitsInput name='otp' onCodeComplete={otp => submit({ otp })} />
                        <Flex center gap={5}>
                            <Text>did_not_receive_code</Text>
                            <Button type='button' mode='text-brand' onClick={() => submit({ idNum: idNum.idNum })}>send_again</Button>
                        </Flex>
                    </Flex>
                }
            </Form>
        </Card>
        <LanguageSwitcher placement='login' />
        <Logo noLink />
        <ThemeToggle />
    </Flex>
}
