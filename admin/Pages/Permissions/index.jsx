import DataForm from 'features/DataManager/DataForm'
import { useModal } from 'common/components/Modal'
import Checkbox from 'common/components/Checkbox'
import styles from './permissions.module.css'
import Button from 'common/components/Button'
import apiReq from 'common/functions/apiReq'
import useApi from 'common/functions/useApi'
import { useEffect, useState } from 'react'
import Form from 'common/components/Form'
import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Tree from 'components/Tree'
import { useText } from 'common/texts/TextProvider'
import { useUser } from 'features/User'

function findFirst(nodes) {
    for (const node of nodes) {
        return node
    }
    return null
}

function groupPermissions(permissionsList) {
    const groups = {}

    permissionsList.sort().forEach((permission) => {
        const [category, action] = permission.split(':')

        if (!category) return

        if (!groups[category]) {
            groups[category] = []
        }

        groups[category].push({
            action: action || 'all',
            fullValue: permission,
        })
    })

    return groups
}

export default function Permissions() {
    const { data = {}, callReq } = useApi('role/tree')
    const { children = [], permissions = [] } = data || {}

    const [selected, setSelected] = useState(null)
    const [selectedPermissions, setSelectedPermissions] = useState([])
    const [changes, setChanges] = useState(false)
    const [formState, setFormState] = useState()
    const { openModal, closeModal } = useModal()
    const { TR } = useText()
    const { roleId, isSuperAdmin, role: adminRole } = useUser()
    const canDeleteRoles = isSuperAdmin || adminRole?.permissions?.includes('role:delete')

    // Track mobile view state: 'tree' (list of roles) or 'form' (permissions)
    const [mobileView, setMobileView] = useState('tree')

    const groupedPermissions = groupPermissions(selected ? selected.possiblePermissions : permissions)

    useEffect(() => {
        if (!selected && children.length) {
            setSelected(findFirst(children))
        }
    }, [children, selected])

    useEffect(() => {
        if (selected) {
            setSelectedPermissions(selected.permissions || [])
            setChanges(false)
        }
    }, [selected])

    function handleSelectRole(node) {
        setSelected(node)
        setMobileView('form') // Switch to permissions screen on mobile select
    }

    function updatePermissions(next) {
        setSelectedPermissions(next)

        const original = selected?.permissions || []

        setChanges(
            next.length !== original.length ||
            next.some((permission) => !original.includes(permission))
        )
    }

    function togglePermission(permission, checked) {
        setFormState({})
        updatePermissions(
            checked
                ? [...new Set([...selectedPermissions, permission])]
                : selectedPermissions.filter((p) => p !== permission)
        )
    }

    function toggleCategory(actions, checked) {
        setFormState({})
        const values = actions.map(({ fullValue }) => fullValue)

        updatePermissions(
            checked
                ? [...new Set([...selectedPermissions, ...values])]
                : selectedPermissions.filter((permission) => !values.includes(permission))
        )
    }

    function onSubmit(vals) {
        setFormState({ loading: true })

        apiReq('role/update', {
            id: selected.id,
            permissions: selectedPermissions.filter(p => selected.possiblePermissions.includes(p)),
        })
            .then(({ permissions }) => {
                callReq()
                setSelected({
                    ...selected,
                    permissions,
                })
                setSelectedPermissions(permissions)
                setChanges(false)
                setFormState({})
            })
            .catch((error) => setFormState({ error }))
    }

    function deleteRole(node) {
        apiReq('role/delete', { id: node.id })
            .then(() => {
                if (selected?.id === node.id)
                    setSelected(null)
                callReq()
            })
            .catch((error) => openModal(<Text>{error?.message || error}</Text>, { title: 'delete role' }))
    }

    function createUpdatePermission(type, defaults) {
        const hasParent = Boolean(defaults?.name)
        const form = [{ name: 'name' }]
        if (type == 'add' && defaults?.id)
            form.push({ name: 'parentId', type: 'hidden', value: defaults.id })

        openModal(<DataForm
            apiRoute='role'
            type={type}
            defaults={type == 'add' ? undefined : defaults}
            form={form}
            onDone={() => {
                callReq()
                closeModal()
            }}
        />, {
            title: type == 'add' ?
                (hasParent ? `${TR('add role under')} ${defaults.name}` : 'add role') :
                'update role'
        })
    }

    return (
        <Flex tag={Card} className={`${styles.permissions} ${styles[mobileView]}`}>
            {/* Roles Sidebar Tree */}
            <div className={styles.roles}>
                <div className={styles.rolesHeader}>
                    <Text bold className={styles.rolesTitle}>roles</Text>
                    {isSuperAdmin && (
                        <Button
                            icon='add'
                            mode='text'
                            className={styles.addRootRoleBtn}
                            onClick={() => createUpdatePermission('add', { id: roleId })}
                        />
                    )}
                </div>
                <Tree
                    nodes={children}
                    selected={selected}
                    onSelect={handleSelectRole}
                    onEditClick={(node) => createUpdatePermission('edit', node)}
                    onAddClick={(node) => createUpdatePermission('add', node)}
                    onDeleteClick={canDeleteRoles ? deleteRole : undefined}
                />
            </div>

            {/* Permissions Form Body */}
            <div className={styles.permissionList}>
                {/* Mobile Back Navigation Header */}
                <Button
                    className={styles.backButton}
                    icon='back'
                    mode='text'
                    onClick={() => setMobileView('tree')}
                >
                    back to roles
                </Button>

                <Form
                    className={styles.form}
                    noSubmit={!changes}
                    action={onSubmit}
                    submitText='save changes'
                    {...formState}
                >
                    <h3>{selected?.name}</h3>

                    {selected && (
                        <div className={styles.categoriesContainer} key={selected.id}>
                            {Object.entries(groupedPermissions).map(([category, actions]) => {
                                const values = actions.map(({ fullValue }) => fullValue)
                                const checked = values.every((permission) => selectedPermissions.includes(permission))

                                return (
                                    <div key={category} className={styles.categoryGroup}>
                                        {/* Group Header */}
                                        <div className={styles.categoryHeader}>
                                            <span className={styles.folderIcon}>
                                                <Checkbox
                                                    checked={checked}
                                                    onChange={(e) => toggleCategory(actions, e.target.checked)}
                                                />
                                            </span>
                                            <Text bold className={styles.categoryName}>
                                                {category}
                                            </Text>
                                        </div>

                                        {/* Actions List */}
                                        <ul className={styles.actionList}>
                                            {actions.map(({ action, fullValue }) => {
                                                const isActive = selectedPermissions.includes(fullValue)

                                                return (
                                                    <li
                                                        key={fullValue}
                                                        className={isActive ? styles.active : ''}
                                                    >
                                                        <label className={styles.checkboxLabel}>
                                                            <Checkbox
                                                                name={fullValue}
                                                                checked={isActive}
                                                                onChange={(e) =>
                                                                    togglePermission(
                                                                        fullValue,
                                                                        e.target.checked
                                                                    )
                                                                }
                                                            />
                                                            <Text className={styles.actionName}>
                                                                {action}
                                                            </Text>
                                                        </label>
                                                    </li>)
                                            })}
                                        </ul>
                                    </div>)
                            })}
                        </div>
                    )}
                </Form>
            </div>
        </Flex>
    )
}