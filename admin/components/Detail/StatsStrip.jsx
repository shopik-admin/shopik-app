import Card from 'common/components/Card'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import styles from './detail.module.css'

/**
 * Top summary strip for detail pages (user page: join date / orders
 * count / total paid / average order). Pure presentational.
 * stats: [{ icon, label, value, sub }]
 */
export default function StatsStrip({ stats = [] }) {
    if (!stats.length) return null
    return <Card className={styles.statsStrip}>
        <Flex justifyContent='space-between' wrap gap={16}>
            {stats.map((stat, i) => <Flex key={i} gap={10} alignItems='flex-start' className={styles.statItem}>
                {stat.icon && <Icon name={stat.icon} size={22} className={styles.statIcon} />}
                <Flex col gap={2}>
                    <Text size='m' mode='sub'>{stat.label}</Text>
                    <Text size='l' bold>{stat.value}</Text>
                    {stat.sub && <Text size='s' mode='sub'>{stat.sub}</Text>}
                </Flex>
            </Flex>)}
        </Flex>
    </Card>
}
