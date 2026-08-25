import Button from 'common/components/Button'
import Popover from 'common/components/Popover'
import Confirm from 'common/components/Confirm'

export default function ConfirmButton({
    q, onOk, onCancel,
    okText = 'confirm', cancelText = 'cancel',
    disabled, ...buttonProps
}) {
    return <Popover
        button={<Button disabled={disabled} {...buttonProps} />}
        disabled={disabled}>
        {({ close }) =>
            <Confirm
                q={q}
                okText={okText}
                cancelText={cancelText}
                onCancel={onCancel ? () => { close(); onCancel?.() } : close}
                onOk={() => { close(); onOk?.() }} />}
    </Popover>
}
