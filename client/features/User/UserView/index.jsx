import DigitsInput from 'common/components/DigitsInput'
import Popover from '#common/components/Popover'
import Button from 'common/components/Button'
import apiReq from 'common/functions/apiReq'
import events from '#common/features/events'
import Input from 'common/components/Input'
import Title from 'common/components/Title'
import styles from './userView.module.css'
import Icon from '#common/components/Icon'
import Flex from 'common/components/Flex'
import Form from 'common/components/Form'
import Tabs from 'common/components/Tabs'
import Text from 'common/components/Text'
import { useUser } from 'features/User'
import { useState } from 'react'
import Account from 'pages/Account'


export default function UserView({ }) {
    const
        user = useUser(),
        [tab, setTab] = useState('login')


    return <Popover id='login' button={<Flex alignItems='center' gap={10} className={styles.button}>
        <Icon name='user' className={styles.icon} />
        <Flex alignItems='center' justifyContent='space-between' grow={1}>
            <Flex col gap={3}>
                <Text bold size='s'>{user?.id ? `good ${getTimeOfDay()}` : 'login_register_btn'}</Text>
                <Text size='xs'>{user?.id ? `${user.name?.first || ''} ${user.name?.last || ''}` : 'login_register_subTitle'}</Text>
            </Flex>
            <Icon name='down' className={styles.chevron} />
        </Flex>
    </Flex>}>
        {({ close }) => {
            if (user?.id)
                return <Flex gap={20} col className={styles.userView}>
                    <Account onClose={close} />
                </Flex>
            return <Flex gap={20} col className={styles.userView}>
                <Tabs active={tab} onChange={setTab} options={['login', 'register']} />
                {tab === 'login' && <LoginModal onClose={close} setTab={setTab} />}
                {tab === 'register' && <RegisterModal onClose={close} setTab={setTab} />}
            </Flex>
        }}
    </Popover>
}

function LoginModal({ onClose, setTab }) {
    const
        [step, setStep] = useState(1),
        [idNum, setIdNum] = useState(''),
        [otpToken, setOtpToken] = useState(''),
        [error, setError] = useState('')

    async function handleRequestOtp(vals) {
        setError('')
        try {
            const targetIdNum = vals?.idNum || idNum
            const res = await apiReq('user/login_otp', { idNum: targetIdNum })
            setOtpToken(res.token)
            if (vals?.idNum) setIdNum(vals.idNum)
            setStep(2)
        } catch (err) {
            setError(err.message || err)
        }
    }

    if (step === 2) {
        return <DigitsInputStep
            title='web_login_title'
            subtitle='web_login_subTitle_otp'
            idNum={idNum}
            otpToken={otpToken}
            onClose={onClose}
            onResend={() => handleRequestOtp()}
            onBack={() => setStep(1)}
            submitText='login'
        />
    }

    return <>
        <Form action={handleRequestOtp} error={error} submitText='send_otp'>
            <Flex col>
                <Title subtitle='web_login_subTitle'>web_login_title</Title>
                <Input name='idNum' defaultValue={idNum} required autoFocus />
            </Flex>
        </Form>
        <Flex center gap={5}>
            <Text>no_account_question</Text>
            <Button type='button' mode='text-brand' onClick={() => { setTab('register') }}>to_register</Button>
        </Flex>
    </>
}

function RegisterModal({ onClose, setTab }) {
    const [step, setStep] = useState(1)
    const [idNum, setIdNum] = useState('')
    const [otpToken, setOtpToken] = useState('')
    const [error, setError] = useState('')

    async function handleRequestOtp(data) {
        setError('')
        try {
            const res = await apiReq('user/register', data)
            setOtpToken(res.token)
            setIdNum(data.idNum)
            setStep(2)
        } catch (err) {
            setError(err.message || err)
        }
    }

    if (step === 2) {
        return <DigitsInputStep
            title='web_register_title'
            subtitle='web_login_subTitle_otp'
            idNum={idNum}
            otpToken={otpToken}
            onClose={onClose}
            onResend={() => handleRequestOtp()}
            onBack={() => setStep(1)}
            submitText='register'
        />
    }

    return <>
        <Form action={handleRequestOtp} error={error} submitText='send_otp'>
            <Title subtitle='web_register_subTitle'>web_register_title</Title>
            <Flex col gap={10}>
                <Input name='idNum' required autoFocus />
                <Input name='phone' type='tel' required />
                <Input name='name.first' />
                <Input name='name.last' />
            </Flex>
        </Form>

        <Flex center gap={5}>
            <Text>have_account_question</Text>
            <Button type='button' mode='text-brand' onClick={() => { setTab('login') }}>to_login</Button>
        </Flex>
    </>
}

function DigitsInputStep({ title, subtitle = 'web_login_subTitle_otp', idNum, otpToken, onClose, onResend, onBack, submitText }) {
    const { onLogin } = useUser()
    const [error, setError] = useState('')
    const [resent, setResent] = useState(false)

    async function handleLogin(vals) {
        setError('')
        try {
            const user = await apiReq('user/login', { idNum, otpToken, otp: vals.otp })
            onLogin(user)
            onClose?.()
            events.emit('delivery-popover')
        } catch (err) {
            setError(err.message || err)
            throw err
        }
    }

    async function resendCode() {
        try {
            setError('')
            await onResend()
            setResent(true)
        } catch (err) {
            setError(err.message || err)
            setResent(false)
        }
    }

    return <>
        <Form action={handleLogin} error={error} submitText={submitText}>
            <Button type='button' mode='text-brand' icon='back' onClick={onBack} style={{ marginBottom: -15 }}>back</Button>
            <Title subtitle={subtitle}>{title}</Title>
            <Flex col gap={10}>
                <DigitsInput name='otp' onCodeComplete={otp => handleLogin({ otp })} />
            </Flex>
        </Form>
        {resent ? '' : <Flex center gap={5}>
            <Text>did_not_receive_code</Text>
            <Button type='button' mode='text-brand' onClick={resendCode}>send_again</Button>
        </Flex>}
    </>
}

function getTimeOfDay() {
    const hour = new Date().getHours()

    if (hour >= 5 && hour < 12) {
        return "morning"
    } else if (hour >= 12 && hour < 17) {
        return "afternoon"
    } else if (hour >= 17 && hour < 21) {
        return "evening"
    } else {
        return "night"
    }
}