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
                personal_details
            </Text>

            <div style={{ maxWidth: 400 }}>
                <Form action={updateDetails} submitText='save_changes' {...formState}>
                    <Input name='name.first' defaultValue={user?.name?.first || ''} placeholder='name.first' label='name.first' required />
                    <Input name='name.last' defaultValue={user?.name?.last || ''} placeholder='name.last' label='name.last' required />
                    <Input name='phone' defaultValue={user?.phone || ''} type='tel' minLength={9} maxLength={15} placeholder='phone_number' label='phone_number' required />
                    <Input name='email' defaultValue={user?.email || ''} type='email' placeholder='email_label' label='email_label' required info='invoices_info' />
                </Form>
            </div>
        </div>
    )
}
