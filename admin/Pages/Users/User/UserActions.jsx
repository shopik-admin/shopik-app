import apiReq from 'common/functions/apiReq'
import { useText } from 'common/texts/TextProvider'
import Button from 'common/components/Button'
import ConfirmButton from 'common/components/ConfirmButton'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import DataForm from 'features/DataManager/DataForm'
import { useModal } from 'common/components/Modal'
import { USER_FORM_FIELDS } from '../form'
import detailStyles from 'components/Detail/detail.module.css'

export default function UserActions({ user, onChanged }) {
    const { TR } = useText()
    const { openModal, closeModal } = useModal()

    function openEdit() {
        openModal(
            <DataForm
                apiRoute='user'
                form={USER_FORM_FIELDS}
                defaults={user}
                onDone={async () => { closeModal(); await onChanged?.() }}
            />,
            { title: `${TR('action_edit')} — ${user.name?.first || ''} ${user.name?.last || ''}`.trim() }
        )
    }

    async function toggleBlocked() {
        await apiReq('user/update', { id: user.id, blocked: !user.blocked })
        await onChanged?.()
    }

    return <Flex gap={8} wrap className={detailStyles.actionsBar}>
        <Button
            mode='outline'
            permission='user:update'
            onClick={openEdit}
            className={detailStyles.actionBtn}
        >{'action_edit'}</Button>
        <ConfirmButton
            mode='outline'
            permission='user:block'
            className={detailStyles.actionBtn}
            q={<Flex col gap={8}>
                <Text size='h3' bold>{'user_update_status'}</Text>
                <Text size='m'>{user.blocked ? 'user_unblock_confirm' : 'user_block_confirm'}</Text>
            </Flex>}
            okText={user.blocked ? 'user_unblock' : 'user_block'}
            onOk={toggleBlocked}
        >{'user_update_status'}</ConfirmButton>
    </Flex>
}
