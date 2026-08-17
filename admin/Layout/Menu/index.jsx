import classNames from 'common/functions/classNames'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import { useSidebar } from '../Sidebar'
import { NavLink } from 'react-router'
import styles from './menu.module.css'
import { Fragment } from 'react'
import usePages from 'Pages'

export default function Menu({ }) {
    const
        { mini } = useSidebar(),
        pages = usePages()

    return <div className={classNames(styles.menu, [styles.mini, mini])}>
        {pages.map((page, i) => <Fragment key={page.path}>
            {(!i || page.section != pages[i - 1].section) ? <Text className={styles.sectiontitle}>{page.section}</Text> : null}
            <NavLink end key={page.path}
                to={page.path}
                className={({ isActive }) =>
                    classNames(styles.menuItem, [styles.active, isActive])}>
                <Icon name={page.icon} />
                <Text className={classNames(styles.name)}>{page.name}</Text>
            </NavLink>
        </Fragment>
        )}
    </div>
}
