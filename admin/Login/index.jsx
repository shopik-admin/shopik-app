import ReactDOM from 'react-dom/client'
import styles from './login.module.css'

import 'common/styles/global.css'
import '../styles/admin.css'

import TextProvider from 'common/texts/TextProvider.jsx'
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
        <Logo noLink />
        <ThemeToggle />
    </Flex>
}
