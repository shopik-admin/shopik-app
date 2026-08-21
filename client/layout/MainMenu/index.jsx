import classNames from 'common/functions/classNames'
import { useEffect, useRef, useState } from 'react'
import styles from './mainMenu.module.css'
import Flex from 'common/components/Flex'
import Icon from 'common/components/Icon'
import Text from 'common/components/Text'
import { NavLink } from 'react-router'
import { useAppData } from 'App'
import { useCart } from 'layout/Cart/CartProvider'

export default function MainMenu({ }) {
    const { menu } = useAppData() || {}
    const { cartOpen } = useCart()
    const [openMenu, setOpenMenu] = useState(null)
    const menuRef = useRef(null)

    useEffect(() => {
        const handlePointerDown = event => {
            if (!menuRef.current?.contains(event.target)) {
                setOpenMenu(null)
            }
        }

        document.addEventListener('pointerdown', handlePointerDown)

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown)
        }
    }, [])

    const close = () => setOpenMenu(null)

    return <nav className={classNames(styles.mainMenu, [styles.shifted, cartOpen])}>
        <Flex ref={menuRef}
            alignItems='center'
            gap={15}
            className={styles.content}>
            {menu?.map((item, i) => (
                <MenuItem
                    key={item.path || i}
                    {...item}
                    main
                    open={openMenu === (item.slug || item.path)}
                    onOpen={() => setOpenMenu(
                        openMenu === (item.slug || item.path) ? null : (item.slug || item.path)
                    )}
                    onClose={close}
                />
            ))}
        </Flex>
    </nav>
}

function MenuItem({
    name,
    path,
    slug,
    icon,
    children,
    main,
    open,
    onOpen,
    onClose,
}) {
    const hasChildren = Boolean(children && children.length > 0)
    const to = path

    if (main) {
        return (
            <li className={styles.mainListItem}>
                <Flex
                    className={styles.mainItem}
                    tag={hasChildren ? 'button' : NavLink}
                    to={hasChildren ? undefined : to}
                    type={hasChildren ? 'button' : undefined}
                    onClick={hasChildren ? onOpen : onClose}
                    end={!hasChildren}
                    alignItems='center'
                    gap={15}
                >
                    <Icon name={icon} fallback />
                    <Text bold size='l'>{name}</Text>
                    {hasChildren && <Icon name='down' />}
                </Flex>

                {hasChildren && (
                    <Level2Menu
                        items={children}
                        open={open}
                        basePath={path}
                        onClose={onClose}
                    />
                )}
            </li>
        )
    }

    return null
}

function Level2Menu({ items, open, basePath, onClose }) {
    const [hoveredItem, setHoveredItem] = useState(null)

    // Reset hover state when the dropdown menu closes
    useEffect(() => {
        if (!open) {
            setHoveredItem(null)
        }
    }, [open])

    return (
        <Flex
            tag='ul'
            col
            direction='column'
            gap={4}
            className={classNames(
                styles.level2Menu,
                [styles.level3visible, hoveredItem],
                [styles.open, open]
            )}
            onMouseLeave={() => setHoveredItem(null)}
        >
            {items.map(item => {
                const hasChildren = Boolean(
                    item.children && item.children.length > 0
                )
                const itemPath = item.slug
                    ? `${basePath}/${item.slug}`
                    : item.path

                return (
                    <li
                        key={itemPath}
                        className={styles.level2ListItem}
                        onMouseEnter={() => {
                            setHoveredItem(
                                hasChildren ? itemPath : null
                            )
                        }}
                    >
                        <Flex
                            className={classNames(
                                styles.level2Item,
                                [styles.active, hoveredItem === itemPath]
                            )}
                            tag={hasChildren ? 'div' : NavLink}
                            to={hasChildren ? undefined : itemPath}
                            onClick={hasChildren ? undefined : onClose}
                            end={!hasChildren}
                            alignItems='center'
                            gap={12}
                        >
                            <div className={styles.iconWrap}>
                                <Icon
                                    name={item.icon}
                                    fallback
                                />
                            </div>

                            <Text size='l'>
                                {item.name}
                            </Text>

                            {hasChildren && hoveredItem === itemPath && (
                                <Icon key="icon-left" name='left' />
                            )}
                            {hasChildren && open && hoveredItem === itemPath && (
                                <Level3Menu
                                    key="level-3-menu"
                                    items={item.children}
                                    visible={open && hoveredItem === itemPath}
                                    basePath={itemPath}
                                    onClose={onClose}
                                />
                            )}
                        </Flex>
                    </li>
                )
            })}
        </Flex>
    )
}

function Level3Menu({ items, visible, basePath, onClose }) {
    return (
        <Flex
            tag='ul'
            className={styles.level3Menu}
            gap={20}
            style={{ display: visible ? 'flex' : 'none' }}
        >
            {items.map(item => {
                const itemPath = item.slug
                    ? `${basePath}/${item.slug}`
                    : item.path

                return (
                    <li
                        key={itemPath}
                        className={styles.level3Group}
                    >
                        <Text
                            bold
                            size='l'
                            className={styles.level3Title}
                        >
                            {item.name}
                        </Text>

                        {item.children?.length > 0 && (
                            <Flex
                                tag='ul'
                                col
                                direction='column'
                                gap={4}
                                className={styles.level4Menu}
                            >
                                {item.children.map(child => {
                                    const childPath = child.slug
                                        ? `${itemPath}/${child.slug}`
                                        : child.path

                                    return (
                                        <li key={childPath}>
                                            <NavLink
                                                to={childPath}
                                                onClick={onClose}
                                                className={styles.level4Item}
                                            >
                                                <Text size='m'>
                                                    {child.name}
                                                </Text>
                                            </NavLink>
                                        </li>
                                    )
                                })}
                            </Flex>
                        )}
                    </li>
                )
            })}
        </Flex>
    )
}