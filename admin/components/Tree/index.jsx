import Button from 'common/components/Button'
import Icon from 'common/components/Icon'
import Flex from 'common/components/Flex'
import styles from './tree.module.css'
import { useState } from 'react'

function TreeNode({
    node,
    selected,
    onSelect,
    onEditClick,
    onAddClick
}) {
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
                    <Flex gap={10}>
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
                />
            ))}
        </div>
    )
}