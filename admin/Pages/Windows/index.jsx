import { useState } from 'react'
import Flex from 'common/components/Flex'
import Tabs from 'common/components/Tabs'
import { useText } from 'common/texts/TextProvider'
import DailyGrid from './DailyGrid'
import WeeklyPlan from './WeeklyPlan'
import MonthCalendar from './MonthCalendar'
import styles from './windows.module.css'

const TABS = [
    { value: 'daily', text: 'windows_tab_daily' },
    { value: 'weekly', text: 'windows_tab_weekly' },
    { value: 'month', text: 'windows_tab_month' }
]

export default function Windows() {
    const { TR } = useText()
    const [tab, setTab] = useState('daily')
    const [dailyDate, setDailyDate] = useState(undefined)
    const [weeklyDirty, setWeeklyDirty] = useState(false)

    function handleTabChange(newTab) {
        if (newTab !== tab && weeklyDirty && !window.confirm(TR('windows_unsaved_confirm')))
            return
        setWeeklyDirty(false)
        setTab(newTab)
    }

    function goToDay(date) {
        setDailyDate(date)
        setWeeklyDirty(false)
        setTab('daily')
    }

    return <Flex col gap={12} className={styles.container}>
        <Tabs options={TABS} active={tab} onChange={handleTabChange} className={styles.tabs} />
        {tab === 'daily' && (
            <DailyGrid date={dailyDate} onDateChange={setDailyDate} />
        )}
        {tab === 'weekly' && (
            <WeeklyPlan onDirtyChange={setWeeklyDirty} />
        )}
        {tab === 'month' && (
            <MonthCalendar onGoToDay={goToDay} />
        )}
    </Flex>
}
