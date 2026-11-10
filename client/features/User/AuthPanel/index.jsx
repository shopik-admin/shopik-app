import DigitsInput from 'common/components/DigitsInput'
import Checkbox from 'common/components/Checkbox'
import Button from 'common/components/Button'
import apiReq from 'common/functions/apiReq'
import events from '#common/features/events'
import Input from 'common/components/Input'
import Title from 'common/components/Title'
import Tabs from 'common/components/Tabs'
import styles from './authPanel.module.css'
import Icon from '#common/components/Icon'
import Flex from 'common/components/Flex'
import Form from 'common/components/Form'
import Text from 'common/components/Text'
import { useUser } from 'features/User'
import { takeCartLoginPending } from 'layout/Cart/cartLoginPending'
import { useAppData } from 'App'
import { useState } from 'react'
import Account from 'pages/Account'

const AUTH_TABS = [
    { value: 'login', text: 'login' },
    { value: 'register', text: 'register' }
]

/**
 * Shared login/register panel — rendered inside the desktop Popover
 * (via UserView) and inline in the mobile menu drawer. `remember`
 * (30-day session) flows through Form values into all three auth calls.
 */
export default function AuthPanel({ onClose }) {
    const user = useUser()
    const [tab, setTab] = useState('login')

    if (user?.id)
        return <Flex gap={20} col className={styles.authPanel}>
            <Account onClose={onClose} />
        </Flex>

    return <Flex gap={16} col className={styles.authPanel}>
        <Tabs options={AUTH_TABS} active={tab} onChange={setTab} className={styles.tabs} />

        {tab === 'login'
            ? <LoginForm onClose={onClose} onToRegister={() => setTab('register')} />
            : <RegisterForm onClose={onClose} onToLogin={() => setTab('login')} />}
    </Flex>
}

function AuthHero({ icon = 'door', title = 'web_login_title', subtitle = 'web_login_subTitle' }) {
    return <Flex col center gap={8} className={styles.hero}>
        <span className={styles.heroIcon}>
            <Icon name={icon} />
        </span>
        <Title subtitle={subtitle}>{title}</Title>
    </Flex>
}

function RememberRow() {
    return <Checkbox
        name='remember'
        defaultChecked
        className={styles.remember}
    >
        <Text size='s'>login_remember_30</Text>
    </Checkbox>
}

function useOtpFlow(requestOtp) {
    const
        [step, setStep] = useState(1),
        [phone, setPhone] = useState(''),
        [otpToken, setOtpToken] = useState(''),
        [remember, setRemember] = useState(true),
        [error, setError] = useState(''),
        [values, setValues] = useState({})

    async function request(vals, opts) {
        setError('')
        try {
            const res = await requestOtp(vals, { phone, ...opts })
            setOtpToken(res.token)
            if (vals?.phone) setPhone(vals.phone)
            setRemember(vals?.remember === true)
            setStep(2)
        } catch (err) {
            setError(err.message || err)
        }
    }

    return { step, setStep, phone, otpToken, remember, error, values, setValues, setError, request }
}

function PhoneInput({ defaultValue }) {
    return <Input
        name='phone'
        type='tel'
        title='login_phone_label'
        placeholder='login_phone_placeholder'
        defaultValue={defaultValue}
        required
        autoFocus
        className={styles.phoneInput}
    />
}

function SwitchFooter({ question, action, onAction }) {
    return <Flex center gap={5}>
        <Text>{question}</Text>
        <Button type='button' mode='text-brand' onClick={onAction}>{action}</Button>
    </Flex>
}

// 019 voice-call OTP is a paid per-domain option, so the link only appears when
// the domain has `sms:019` VOICE.enabled on (exposed in the SSR feature flags).
function VoiceOtpButton({ flow }) {
    function requestVoice() {
        const digits = String(flow.values?.phone ?? '').replace(/\D/g, '')
        if (!/^0?5\d{8}$/.test(digits)) {
            flow.setError('Invalid phone number')
            return
        }
        return flow.request(flow.values, { channel: 'voice' })
    }

    return <Flex center className={styles.voiceCall}>
        <Button type='button' mode='text-brand' icon='phoneOutgoing' onClick={requestVoice}>
            send_otp_voice
        </Button>
    </Flex>
}

function LoginForm({ onClose, onToRegister }) {
    const { features } = useAppData() || {}
    const flow = useOtpFlow((vals, opts) =>
        apiReq('user/login_otp', {
            phone: vals?.phone || opts?.phone,
            remember: vals?.remember === true,
            channel: opts?.channel
        }))

    if (flow.step === 2) {
        return <DigitsInputStep
            phone={flow.phone}
            otpToken={flow.otpToken}
            remember={flow.remember}
            onClose={onClose}
            onResend={() => flow.request()}
            onBack={() => flow.setStep(1)}
            submitText='login'
        />
    }

    return <>
        <AuthHero />
        <Form action={flow.request} error={flow.error} submitText='send_otp' className={styles.form} onChange={flow.setValues}>
            <Flex col gap={4}>
                <PhoneInput defaultValue={flow.phone} />
            </Flex>
            <RememberRow />
        </Form>
        {features?.voiceOtp && <VoiceOtpButton flow={flow} />}
        <SwitchFooter question='no_account_question' action='to_register' onAction={onToRegister} />
    </>
}

function RegisterForm({ onClose, onToLogin }) {
    const { features } = useAppData() || {}
    const flow = useOtpFlow((vals, opts) =>
        apiReq('user/register', {
            ...vals,
            phone: vals?.phone || opts?.phone,
            remember: vals?.remember === true,
            channel: opts?.channel
        }))

    if (flow.step === 2) {
        return <DigitsInputStep
            title='web_register_title'
            phone={flow.phone}
            otpToken={flow.otpToken}
            remember={flow.remember}
            onClose={onClose}
            onResend={() => flow.request()}
            onBack={() => flow.setStep(1)}
            submitText='register'
        />
    }

    return <>
        <AuthHero icon='circleUser' title='web_register_title' subtitle='web_register_phone_subTitle' />
        <Form action={flow.request} error={flow.error} submitText='send_otp' className={styles.form} onChange={flow.setValues}>
            <Flex col gap={10}>
                <PhoneInput />
                <Input name='name.first' />
                <Input name='name.last' />
            </Flex>
            <RememberRow />
        </Form>
        {features?.voiceOtp && <VoiceOtpButton flow={flow} />}
        <SwitchFooter question='have_account_question' action='to_login' onAction={onToLogin} />
    </>
}

function DigitsInputStep({ title = 'web_login_title', subtitle = 'web_login_subTitle_otp', phone, otpToken, remember, onClose, onResend, onBack, submitText }) {
    const { onLogin } = useUser()
    const [error, setError] = useState('')
    const [resent, setResent] = useState(false)

    async function handleLogin(vals) {
        setError('')
        try {
            const user = await apiReq('user/login', { phone, otpToken, otp: vals.otp, remember })
            onLogin(user)
            onClose?.()
            // Mobile guest pay flow reopens the cart instead of the
            // desktop-style delivery prompt; the user taps pay again.
            if (takeCartLoginPending()) events.emit('reopen-cart')
            else events.emit('delivery-popover')
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
        <Form action={handleLogin} error={error} submitText={submitText} className={styles.form}>
            <Button type='button' mode='text-brand' icon='back' onClick={onBack} style={{ marginBottom: -15 }}>back</Button>
            <Title subtitle={subtitle}>{title}</Title>
            <Flex col gap={10}>
                <DigitsInput name='otp' onCodeComplete={otp => handleLogin({ otp })} />
            </Flex>
        </Form>
        {!resent && <Flex center gap={5}>
            <Text>did_not_receive_code</Text>
            <Button type='button' mode='text-brand' onClick={resendCode}>send_again</Button>
        </Flex>}
    </>
}
