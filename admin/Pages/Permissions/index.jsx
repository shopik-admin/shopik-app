import DataForm from 'Features/DataManager/DataForm'
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
import { useModal } from 'Layout/Modal'
import Tree from 'components/Tree'

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

    function createUpdatePermission(type, defaults) {
        const form = [{ name: 'name' }]
        if (type == 'add')
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
                `add role under the role ${defaults.name}` : 'update role'
        })
    }

    return (
        <Flex tag={Card} className={`${styles.permissions} ${styles[mobileView]}`}>
            {/* Roles Sidebar Tree */}
            <div className={styles.roles}>
                <Tree
                    nodes={children}
                    selected={selected}
                    onSelect={handleSelectRole}
                    onEditClick={(node) => createUpdatePermission('edit', node)}
                    onAddClick={(node) => createUpdatePermission('add', node)}
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