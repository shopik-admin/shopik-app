import ReactDOM from 'react-dom/client'
import styles from './login.module.css'
import 'styles/global.css'
import 'styles/theme.css'
import 'styles/font.css'

import TextProvider from 'common/texts/TextProvider.jsx'
import DigitsInput from 'components/DigitsInput'
import ThemeToggle from 'components/ThemeToggle'
import apiReq from 'common/functions/apiReq.js'
import Input from 'common/components/Input'
import Form from 'common/components/Form'
import Text from 'common/components/Text'
import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import { useState } from 'react'

ReactDOM
    .createRoot(document.getElementById('root'))
    .render(<TextProvider>
        <Login />
    </TextProvider>)


export default function Login() {
    const
        [formState, setFormState] = useState({}),
        [idNum, setIdNum] = useState()

    function submit(vals) {
        setFormState({ loading: true })

        if (idNum) vals = { ...vals, ...idNum }

        apiReq(`admin/login${idNum ? '' : '_otp'}`, vals)
            .then(({ token }) => {
                if (idNum) {
                    location.reload()
                }
                else {
                    setIdNum({ otpToken: token, idNum: vals.idNum })
                    setFormState({})
                }
            })
            .catch(error => setFormState({ error }))
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
                        type='isNum'
                        autoComplete='off'
                        info='idNum_input_description'
                        placeholder='idNum_placeholder'
                    /> :
                    <>
                        <DigitsInput name='otp' onCodeComplete={otp => submit({ otp })} />
                        {/* <Text mode='sub'>login_resendCode</Text> */}
                    </>
                }
            </Form>
        </Card>
        <ThemeToggle />
    </Flex>
}
