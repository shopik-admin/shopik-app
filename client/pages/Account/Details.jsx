import Input from 'common/components/Input'
import Text from 'common/components/Text'
import Form from 'common/components/Form'
import { useUser } from 'features/User'
import { useState } from 'react'

export default function Details() {
    const user = useUser()
    const [formState, setFormState] = useState()

    function updateDetails(data) {
        setFormState({ loading: true })
        user.userEdit(data)
            .then(() => setFormState({ success: true, loading: false }))
            .catch(error => setFormState({ error, loading: false }))
    }

    return (
        <div>
            <Text tag='h2' size='h3' bold style={{ marginBottom: 16 }}>
                פרטים אישיים
            </Text>

            <div style={{ maxWidth: 400 }}>
                <Form action={updateDetails} submitText='שמור שינויים' {...formState}>
                    <Input name='name.first' defaultValue={user?.name?.first || ''} placeholder='שם פרטי' label='שם פרטי' required />
                    <Input name='name.last' defaultValue={user?.name?.last || ''} placeholder='שם משפחה' label='שם משפחה' required />
                    <Input name='phone' defaultValue={user?.phone || ''} type='tel' minLength={9} maxLength={15} placeholder='מספר טלפון' label='מספר טלפון' required />
                    <Input name='email' defaultValue={user?.email || ''} type='email' placeholder='דואר אלקטרוני' label='דואר אלקטרוני' required info='for recieve invoices and updates' />
                </Form>
            </div>
        </div>
    )
}
