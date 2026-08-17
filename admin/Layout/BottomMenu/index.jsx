import styles from './bottomMenu.module.css'
import classNames from 'common/functions/classnames'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import Flex from 'common/components/Flex'
import { useSidebar } from '../Sidebar'
import { NavLink } from 'react-router'
import pages from 'Pages'

export default function BottomMenu({ }) {
    const { toggle, open } = useSidebar()

    return <Flex className={classNames(styles.bottomMenu, [styles.hide, open])} justifyContent='space-between'>
        <NavLink
            onClick={toggle}
            className={styles.menuItem}>
            <Icon name={'menu'} />
            <Text className={styles.name}>menu</Text>
        </NavLink>
        {pages
            // .filter(p => p.bottomMenu)
            .map(page => <NavLink end key={page.path}
                to={page.path}
                className={({ isActive }) =>
                    classNames(styles.menuItem, [styles.active, isActive])}>
                <Icon name={page.icon} />
                <Text className={classNames(styles.name/* , [styles.hide, mini] */)}>{page.name}</Text>
            </NavLink>)}
    </Flex>
}
