import { useState } from 'react'
import classNames from 'common/functions/classNames'
import Confirm from 'common/components/Confirm'
import ContextMenu from 'common/components/ContextMenu'
import Icon from 'common/components/Icon'
import { useModal } from 'common/components/Modal'
import { useText } from 'common/texts/TextProvider'
import { settingHint, settingLabel } from './settingsKeys'
import styles from './settings.module.css'

/**
 * One settings row: human label + raw key + visibility state + explanation,
 * the control on the side and a single "⋯" menu for the row actions.
 *
 * The same shell is used by every form type (switch / color / file / config /
 * text) so the row markup and action wiring live in exactly one place.
 */
export default function SettingRow({
    setting,
    children,
    footer,
    expanded = false,
    busy = false,
    error = null,
    saved = false,
    onEditFull,
    onDelete,
    onTogglePublic
}) {
    const { TR } = useText()
    const { openModal, closeModal } = useModal()
    const [copied, setCopied] = useState(false)

    const label = settingLabel(TR, setting)
    const hint = settingHint(TR, setting)
    const isPublic = !!setting?.public

    async function copyKey() {
        try {
            await navigator.clipboard.writeText(setting.key)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch {
            // Clipboard API needs a secure context; fall back to a hidden field.
            try {
                const field = document.createElement('textarea')
                field.value = setting.key
                field.setAttribute('readonly', '')
                field.style.position = 'fixed'
                field.style.opacity = '0'
                document.body.appendChild(field)
                field.select()
                document.execCommand('copy')
                field.remove()
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
            } catch { }
        }
    }

    function requestDelete() {
        openModal(
            <Confirm
                q={TR('settings_delete_confirm', { key: setting.key })}
                okText={TR('delete')}
                cancelText={TR('cancel')}
                onOk={() => { closeModal(); onDelete?.() }}
                onCancel={closeModal}
            />,
            { title: TR('settings_delete_title') }
        )
    }

    const options = [
        onEditFull && {
            text: 'settings_edit_fields',
            icon: 'edit',
            onClick: () => onEditFull(setting)
        },
        {
            text: copied ? 'settings_copied' : 'settings_copy_key',
            icon: copied ? 'check' : 'copy',
            mode: 'text',
            tooltip: setting.key,
            onClick: copyKey
        },
        onDelete && {
            text: 'settings_delete',
            icon: 'trash',
            mode: 'danger',
            separator: true,
            disabled: busy,
            onClick: requestDelete
        }
    ].filter(Boolean)

    return <div className={classNames(styles.row, [styles.rowExpanded, expanded])}>
        <div className={styles.rowMain}>
            <div className={styles.rowText}>
                <div className={styles.rowTitleRow}>
                    <span className={styles.rowLabel}>{label}</span>
                    <code className={styles.rowKey} title={TR('settings_copy_key')}>{setting.key}</code>
                    {onTogglePublic && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={onTogglePublic}
                            title={TR('settings_public_toggle_hint')}
                            className={classNames(styles.visibilityBtn, [styles.visibilityOn, isPublic])}
                        >
                            <Icon name={isPublic ? 'shield' : 'door'} className={styles.visibilityIcon} />
                            {TR(isPublic ? 'settings_public_badge' : 'settings_private_badge')}
                        </button>
                    )}
                    {saved && (
                        <span className={styles.savedTag}>
                            <Icon name="v" />
                            {TR('settings_saved')}
                        </span>
                    )}
                </div>
                {hint && <p className={styles.rowHint}>{hint}</p>}
                {error && <p className={styles.rowError}>{error}</p>}
            </div>

            <div className={styles.rowControl}>{children}</div>

            {options.length > 0 && (
                <div className={styles.rowMenu}>
                    <ContextMenu options={options} iconOnStart />
                </div>
            )}
        </div>

        {expanded && footer && <div className={styles.rowPanel}>{footer}</div>}
    </div>
}
