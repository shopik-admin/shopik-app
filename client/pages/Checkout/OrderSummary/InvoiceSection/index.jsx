import { useEffect, useState } from 'react'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Form from 'common/components/Form'
import Input from 'common/components/Input'
import Checkbox from 'common/components/Checkbox'
import Collapse from 'common/components/Collapse'
import { LuPencil, LuReceiptText } from 'react-icons/lu'
import { useOrder } from 'features/Order/OrderProvider'
import { useUser } from 'features/User'
import { useText } from 'common/texts/TextProvider'
import styles from './invoiceSection.module.css'
import summaryStyles from '../orderSummary.module.css'

const clean = (value) => String(value ?? '').trim()

/**
 * Billing details for the tax invoice.
 *
 * The values stay on the order (`order.invoiceRequest`) and are sent to the
 * server with `payment/create`: the invoice is issued at capture time from the
 * stored order snapshot, so nothing is written to the document from the client.
 *
 * The form has no submit button — every change updates the order state, which
 * keeps "Pay" and the invoice details in sync without an extra save step.
 */
export default function InvoiceSection({ missing = false }) {
    const { order = {}, setOrder } = useOrder()
    const user = useUser()
    const { TR } = useText() || {}
    const request = order?.invoiceRequest || {}
    const [open, setOpen] = useState(false)
    const [required, setRequired] = useState(request.required === true)

    // The checkout validation opens this section when the customer asked for a
    // tax invoice but did not supply a company/ID number.
    useEffect(() => {
        if (missing) setOpen(true)
    }, [missing])

    const initial = {
        taxId: request.taxId || user?.taxId || '',
        companyName: request.companyName || user?.companyName || '',
        email: request.email || '',
        note: request.note || ''
    }

    function handleChange(values) {
        const invoice = values?.invoice || {}
        const isRequired = invoice.required === true
        const next = isRequired || clean(invoice.taxId) || clean(invoice.companyName) || clean(invoice.email) || clean(invoice.note)
            ? {
                required: isRequired,
                taxId: clean(invoice.taxId),
                companyName: clean(invoice.companyName),
                email: clean(invoice.email),
                note: clean(invoice.note)
            }
            : null
        setOrder(prev => ({ ...(prev || {}), invoiceRequest: next }))
    }

    const title = required
        ? (request.companyName || request.taxId || TR?.('invoice_section_title'))
        : TR?.('invoice_optional_none')

    return <Collapse
        open={open}
        onToggle={setOpen}
        showChevron={false}
        className={summaryStyles.summaryCollapse}
        title={
            <Flex alignItems='center' justifyContent='space-between' width='100%'>
                <Flex alignItems='center' gap={12}>
                    <div className={summaryStyles.iconCircle}>
                        <LuReceiptText className={summaryStyles.rowIcon} />
                    </div>
                    <Flex col gap={2}>
                        <Text bold size='m' className={summaryStyles.rowText}>{title}</Text>
                        {required && request.taxId
                            ? <Text size='s' mode='sub' className={summaryStyles.rowText}>{request.taxId}</Text>
                            : null}
                    </Flex>
                </Flex>
                <button
                    type='button'
                    className={summaryStyles.editBtn}
                    onClick={(e) => { e.stopPropagation(); setOpen(prev => !prev) }}
                    aria-label={TR?.('invoice_section_title')}
                >
                    <LuPencil />
                </button>
            </Flex>
        }
    >
        <div className={styles.content}>
            <Text size='s' mode='sub'>{'invoice_section_hint'}</Text>
            <Form noSubmit onChange={handleChange}>
                <Flex col gap={10}>
                    <Checkbox
                        name='invoice.required'
                        checked={required}
                        onChange={(e) => setRequired(e.target.checked)}
                    >
                        {TR?.('invoice_required_label')}
                    </Checkbox>
                    {required && <>
                        <Input
                            name='invoice.taxId'
                            defaultValue={initial.taxId}
                            label='invoice_tax_id'
                            required
                            inputMode='numeric'
                            maxLength={9}
                        />
                        <Input
                            name='invoice.companyName'
                            defaultValue={initial.companyName}
                            label='invoice_company_name'
                            maxLength={100}
                        />
                        <Input
                            name='invoice.email'
                            type='email'
                            defaultValue={initial.email}
                            label='invoice_email'
                            maxLength={120}
                        />
                        <Input
                            name='invoice.note'
                            defaultValue={initial.note}
                            label='invoice_note'
                            maxLength={200}
                        />
                    </>}
                </Flex>
            </Form>
        </div>
    </Collapse>
}
