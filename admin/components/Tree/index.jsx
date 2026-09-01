import Button from 'common/components/Button'
import ConfirmButton from 'common/components/ConfirmButton'
import Icon from 'common/components/Icon'
import Flex from 'common/components/Flex'
import styles from './tree.module.css'
import { useState } from 'react'
import { useText } from 'common/texts/TextProvider'

function TreeNode({
    node,
    selected,
    onSelect,
    onEditClick,
    onAddClick,
    onDeleteClick
}) {
    const { TR } = useText()
    const hasChildren = node.children?.length > 0
    const [expanded, setExpanded] = useState(true)

    return (
        <div className={styles.item}>
            <div
                className={[
                    styles.node,
                    selected?.id === node.id && styles.selected,
                ]
                    .filter(Boolean)
                    .join(' ')}
            >
                {hasChildren ? (
                    <button
                        type="button"
                        className={[
                            styles.chevron,
                            expanded && styles.expanded,
                        ]
                            .filter(Boolean)
                            .join(' ')}
                        onClick={() => setExpanded(v => !v)}
                    >
                        <Icon name='left' />
                    </button>
                ) : (
                    <span className={styles.chevronPlaceholder} />
                )}

                <Flex
                    alignItems='center'
                    justifyContent='space-between'
                    className={styles.label}
                    onClick={() => onSelect(node)}
                >
                    {node.name}
                    <Flex gap={4}>
                        {onDeleteClick && (
                            <ConfirmButton
                                q={`${TR('delete role confirm')} "${node.name}"?`}
                                onOk={() => onDeleteClick?.(node)}
                                icon='trash'
                                mode='text'
                                className={styles.deleteBtn}
                                preventDefault
                                stopPropagation
                                disabled={hasChildren}
                                tooltip={hasChildren ? 'role_delete_button_disabled_tooltip' : ''}
                            />
                        )}
                        <Button icon='edit' mode='text' className={styles.addBtn} preventDefault stopPropagation onClick={() => onEditClick?.(node)} />
                        <Button icon='add' mode='text' className={styles.editBtn} preventDefault stopPropagation onClick={() => onAddClick?.(node)} />
                    </Flex>
                </Flex>
            </div>

            {hasChildren && expanded && (
                <div className={styles.children}>
                    <Tree
                        nodes={node.children}
                        selected={selected}
                        onSelect={onSelect}
                        onEditClick={onEditClick}
                        onAddClick={onAddClick}
                        onDeleteClick={onDeleteClick}
                    />
                </div>
            )}
        </div>
    )
}

export default function Tree({
    nodes,
    selected,
    onSelect,
    onEditClick,
    onAddClick,
    onDeleteClick,
}) {
    return (
        <div className={styles.tree}>
            {nodes.map(node => (
                <TreeNode
                    key={node.id}
                    node={node}
                    selected={selected}
                    onSelect={onSelect}
                    onEditClick={onEditClick}
                    onAddClick={onAddClick}
                    onDeleteClick={onDeleteClick}
                />
            ))}
        </div>
    )
}