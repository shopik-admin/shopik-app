import Input from 'common/components/Input/index.jsx'
import apiReq from 'common/functions/apiReq.js'
import styles from './dataForm.module.css'
import Form from 'common/components/Form'
import { useState } from 'react'

export default function DataForm({ apiRoute, form = [], defaults, onDone }) {
    const [formState, setFormState] = useState()
    // Native FormData serializes a checked checkbox as "on" (unchecked = absent).
    // Coerce checkbox/switch fields to real booleans so the server gets true/false.
    const booleanFields = form.filter(item => item.type === 'checkbox' || item.type === 'switch').map(item => item.name)

    function submit(vals) {
        setFormState({ loading: true })
        vals.id = defaults?.id
        for (const name of booleanFields) {
            if (name in vals) vals[name] = vals[name] === 'on' || vals[name] === 'true' || vals[name] === true
            else vals[name] = false
        }
        apiReq(`${apiRoute}/${defaults ? 'update' : 'create'}`, vals)
            .then(() => onDone())
            .catch(error => setFormState({ error }))
    }

    return <Form
        className={styles.dataForm}
        action={submit}
        {...formState}
    >
        {form.map(item => <Input
            key={item.name}
            {...item}
            defaultValue={getDefaultValue(item.name, defaults)}
        />)}
    </Form>
}

function getDefaultValue(name, row) {
    return name.split('.').reduce((obj, key) => obj?.[key], row)
}
