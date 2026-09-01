import { useEffect, useState } from 'react'
import { useModal } from 'common/components/Modal'
import Checkbox from 'common/components/Checkbox'
import Button from 'common/components/Button'
import ConfirmButton from 'common/components/ConfirmButton'
import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Form from 'common/components/Form'
import Input from 'common/components/Input'
import Select from 'common/components/Select'
import apiReq from 'common/functions/apiReq'
import useApi from 'common/functions/useApi'
import { useUser } from 'features/User'
import apiKeyPermissions from 'common/constants/apiKeyPermissions.js'
import styles from './apiKeys.module.css'

function groupPermissions(list) {
    const groups = {}
    list.slice().sort().forEach((permission) => {
        const [category, action] = permission.split(':')
        if (!category) return
        if (!groups[category]) groups[category] = []
        groups[category].push({ action: action || 'all', fullValue: permission })
    })
    return groups
}

function CreateKeyForm({ onClose, onCreated }) {
    const [name, setName] = useState('')
    const [domainId, setDomainId] = useState('default')
    const [error, setError] = useState(null)
    const [loading, setLoading] = useState(false)
    const [createdKey, setCreatedKey] = useState(null)
    const [copied, setCopied] = useState(false)

    async function handleSubmit(e) {
        e.preventDefault()
        setLoading(true)
        setError(null)
        try {
            const result = await apiReq('api_key/create', { name: name.trim(), domainId })
            setCreatedKey(result)
            onCreated?.(result)
        } catch (err) {
            setError(err?.message || 'Failed to create key')
        } finally {
            setLoading(false)
        }
    }

    async function handleCopy() {
        if (!createdKey?.key) return
        try { await navigator.clipboard.writeText(createdKey.key); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { }
    }

    if (createdKey?.key) {
        return (
            <Flex col gap={16}>
                <Text size="l" bold>API key created</Text>
                <div className={styles.keyDisplay}>
                    <Text bold>{createdKey.name}</Text>
                    <div className={styles.keyValue}>{createdKey.key}</div>
                    <Text className={styles.warning}>Copy now — this key will not be shown again.</Text>
                    <Flex gap={8}>
                        <Button icon={copied ? 'check' : 'copy'} onClick={handleCopy}>{copied ? 'Copied' : 'Copy'}</Button>
                        <Button mode="outline" onClick={onClose}>Done</Button>
                    </Flex>
                </div>
            </Flex>
        )
    }

    return (
        <form onSubmit={handleSubmit} className={styles.createForm}>
            <Input label="Name *" required value={name} onChange={e => setName(e.target.value)} placeholder="My integration" />
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontWeight: 500, fontSize: '0.95rem' }}>Domain *</span>
                <Select options="domains" value={domainId} onChange={e => setDomainId(e.target.value)} required />
            </label>
            {error && <Text style={{ color: 'var(--text-error-primary)' }}>{error}</Text>}
            <Flex gap={12} justifyContent="end">
                <Button mode="outline" onClick={onClose} disabled={loading}>Cancel</Button>
                <Button type="submit" loading={loading} disabled={!name.trim()}>Create</Button>
            </Flex>
        </form>
    )
}

export default function ApiKeys() {
    const { data: rawData, callReq, loading } = useApi('api_key/read')
    const keys = Array.isArray(rawData) ? rawData : []
    const [selected, setSelected] = useState(null)
    const [selectedPermissions, setSelectedPermissions] = useState([])
    const [changes, setChanges] = useState(false)
    const [formState, setFormState] = useState({})
    const [mobileView, setMobileView] = useState('list')
    const { openModal, closeModal } = useModal()
    const { isSuperAdmin } = useUser()

    const groupedAllowed = groupPermissions(apiKeyPermissions)

    useEffect(() => {
        if (!selected && keys.length) setSelected(keys[0])
    }, [keys, selected])

    useEffect(() => {
        if (selected) {
            const full = keys.find(k => k.id === selected.id) || selected
            setSelected(prev => full)
            setSelectedPermissions(full.permissions || [])
            setChanges(false)
            setFormState({})
        }
    }, [selected?.id, keys])

    useEffect(() => {
        if (!selected) return
        const original = keys.find(k => k.id === selected.id)
        if (!original) return
        const origPerms = original.permissions || []
        const permChanged = selectedPermissions.length !== origPerms.length || selectedPermissions.some(p => !origPerms.includes(p))
        setChanges(permChanged)
    }, [selectedPermissions, selected, keys])

    function handleSelect(key) {
        setSelected(key)
        setMobileView('detail')
    }

    function togglePermission(permission, checked) {
        setFormState({})
        setSelectedPermissions(prev => checked ? [...new Set([...prev, permission])] : prev.filter(p => p !== permission))
    }

    function toggleCategory(actions, checked) {
        const values = actions.map(a => a.fullValue)
        setFormState({})
        setSelectedPermissions(prev => checked ? [...new Set([...prev, ...values])] : prev.filter(p => !values.includes(p)))
    }

    function onSubmit() {
        if (!selected) return
        setFormState({ loading: true })
        apiReq('api_key/update', { id: selected.id, permissions: selectedPermissions })
            .then(updated => {
                callReq()
                setSelected(updated)
                setFormState({})
                setChanges(false)
            })
            .catch(error => setFormState({ error: error?.message || 'Failed to save' }))
    }

    function handleDeleteKey(key) {
        apiReq('api_key/delete', { id: key.id })
            .then(() => {
                if (selected?.id === key.id) setSelected(null)
                callReq()
            })
            .catch(error => openModal(<Text>{error?.message || 'Delete failed'}</Text>, { title: 'Error' }))
    }

    function handleToggleActive(key) {
        apiReq('api_key/update', { id: key.id, active: !key.active })
            .then(() => callReq())
            .catch(error => openModal(<Text>{error?.message || 'Toggle failed'}</Text>, { title: 'Error' }))
    }

    function openCreate() {
        openModal(
            <CreateKeyForm
                onClose={closeModal}
                onCreated={() => { callReq() }}
            />,
            { title: 'Create API Key' }
        )
    }

    if (!isSuperAdmin) {
        return (
            <Flex tag={Card} style={{ padding: '2rem', justifyContent: 'center' }}>
                <Text>Forbidden — super admin only</Text>
            </Flex>
        )
    }

    return (
        <Flex tag={Card} className={`${styles.apiKeys} ${styles[mobileView]}`}>
            <div className={styles.keys}>
                <div className={styles.keysHeader}>
                    <Text bold className={styles.keysTitle}>API Keys</Text>
                    <Button icon="add" mode="text" onClick={openCreate} title="Create API key" />
                </div>
                {loading && keys.length === 0 ? (
                    <Text className={styles.keyMeta}>Loading...</Text>
                ) : keys.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Text>No API keys yet</Text>
                        <Button icon="add" onClick={openCreate}>Create API key</Button>
                    </div>
                ) : (
                    <ul className={styles.keyList}>
                        {keys.map(k => (
                            <li
                                key={k.id}
                                className={`${styles.keyItem} ${selected?.id === k.id ? styles.selected : ''} ${k.active === false ? styles.disabled : ''}`}
                                onClick={() => handleSelect(k)}
                            >
                                <Flex col gap={2} style={{ minWidth: 0 }}>
                                    <span className={styles.keyName}>{k.name}</span>
                                    <span className={styles.keyMeta}>{k.domainId} · {k.keyPrefix}… · {k.active === false ? 'disabled' : 'active'}</span>
                                </Flex>
                                <Flex gap={4} className={styles.keyActions}>
                                    <Button
                                        icon={k.active === false ? 'play' : 'pause'}
                                        mode="text"
                                        className={k.active === false ? styles.toggleBtnOff : styles.toggleBtn}
                                        preventDefault
                                        stopPropagation
                                        onClick={() => handleToggleActive(k)}
                                        title={k.active === false ? 'Enable' : 'Disable'}
                                    />
                                    <ConfirmButton
                                        q={`Delete "${k.name}"?`}
                                        onOk={() => handleDeleteKey(k)}
                                        icon="trash"
                                        mode="text"
                                        className={styles.deleteBtn}
                                        preventDefault
                                        stopPropagation
                                    />
                                </Flex>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className={styles.keyDetail}>
                <Button className={styles.backButton} icon="back" mode="text" onClick={() => setMobileView('list')}>Back to keys</Button>
                {selected ? (
                    <>
                        <div className={styles.detailHeader}>
                            <div>
                                <h3>{selected.name}</h3>
                                <div className={styles.keySubtitle}>{selected.domainId} · {selected.keyPrefix}… · {selected.id} · {selected.active === false ? 'disabled' : 'active'}</div>
                            </div>
                        </div>



                        <Form noSubmit={!changes} action={onSubmit} submitText="save changes" {...formState}>
                            <div className={styles.categoriesContainer}>
                                {Object.entries(groupedAllowed).map(([category, actions]) => {
                                    const values = actions.map(a => a.fullValue)
                                    const checked = values.every(p => selectedPermissions.includes(p))
                                    return (
                                        <div key={category} className={styles.categoryGroup}>
                                            <div className={styles.categoryHeader}>
                                                <Checkbox checked={checked} onChange={e => toggleCategory(actions, e.target.checked)} />
                                                <Text bold>{category}</Text>
                                            </div>
                                            <ul className={styles.actionList}>
                                                {actions.map(({ action, fullValue }) => {
                                                    const isActive = selectedPermissions.includes(fullValue)
                                                    return (
                                                        <li key={fullValue} className={isActive ? styles.active : ''}>
                                                            <label className={styles.checkboxLabel}>
                                                                <Checkbox checked={isActive} onChange={e => togglePermission(fullValue, e.target.checked)} />
                                                                <Text>{action}</Text>
                                                            </label>
                                                        </li>
                                                    )
                                                })}
                                            </ul>
                                        </div>
                                    )
                                })}
                            </div>
                        </Form>
                    </>
                ) : (
                    <div className={styles.emptyState}>
                        <Text>Select a key to edit</Text>
                    </div>
                )}
            </div>
        </Flex >
    )
}
