import { useEffect, useMemo, useState } from 'react'
import useApi from 'common/functions/useApi'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import Icon from 'common/components/Icon'
import Loader from 'common/components/Loader'
import Text from 'common/components/Text'
import classNames from 'common/functions/classNames'
import { currentMonth, addMonths, monthGridDays, todayStr } from '../dates.js'
import DayCell from './dayCell.jsx'
import SpecialDayModal from './specialDayModal.jsx'
import { useModal } from 'common/components/Modal'
import { useText } from 'common/texts/TextProvider'
import styles from './month.module.css'

export default function MonthCalendar({ onGoToDay }) {
    const { TR } = useText()
    const [month, setMonth] = useState(currentMonth())

    const cells = useMemo(() => monthGridDays(month), [month])
    const rangeFrom = cells[0].date
    const rangeTo = cells[cells.length - 1].date

    const { data: specialDays = [], loading, callReq } = useApi('special_day/read', {}, { hold: true })
    const { data: stores = [] } = useApi('store/read', { limit: 0 })
    const { openModal, closeModal } = useModal()

    useEffect(() => {
        callReq({ fromDate: rangeFrom, toDate: rangeTo })
    }, [rangeFrom, rangeTo])

    const today = todayStr()

    const specialsByDate = useMemo(() => {
        const map = new Map()
        for (const sd of specialDays || []) {
            if (!map.has(sd.date)) map.set(sd.date, [])
            map.get(sd.date).push(sd)
        }
        return map
    }, [specialDays])

    function storeName(id) {
        return stores.find(s => s.id === id)?.name || id
    }

    function openModalFor(state) {
        openModal(
            <SpecialDayModal
                special={state.special}
                date={state.date}
                stores={stores}
                onDone={(verb) => {
                    callReq({ fromDate: rangeFrom, toDate: rangeTo })
                }}
                onClose={closeModal}
            />,
            { title: state.special ? `${TR('windows_edit_special_day')} — ${state.special.name}` : `${TR('windows_new_special_day')} — ${state.date}` }
        )
    }

    return <Flex col gap={10}>
        <Flex gap={10} alignItems="center" className={styles.header}>
            <button className={styles.navBtn} onClick={() => setMonth(m => addMonths(m, -1))} title={TR('windows_prev_month')}>
                <Icon name="right" />
            </button>
            <span className={styles.monthLabel}>{month}</span>
            <button className={styles.navBtn} onClick={() => setMonth(m => addMonths(m, 1))} title={TR('windows_next_month')}>
                <Icon name="left" />
            </button>
            <Button size="s" mode="outline" onClick={() => setMonth(currentMonth())}>windows_today</Button>
            {loading && <Loader size={18} />}
        </Flex>

        <div className={styles.grid}>
            {[0, 1, 2, 3, 4, 5, 6].map(d => (
                <div key={d} className={styles.weekdayHeader}>{TR(`day-${d}-short`)}</div>
            ))}

            {cells.map(cell => (
                <DayCell
                    key={cell.date}
                    cell={cell}
                    specials={specialsByDate.get(cell.date) || []}
                    storeName={storeName}
                    isPast={cell.date < today}
                    isToday={cell.date === today}
                    onAdd={date => openModalFor({ date })}
                    onEditChip={sd => openModalFor({ special: sd })}
                    onGoToDay={onGoToDay}
                />
            ))}
        </div>

        <div className={classNames(styles.hint)}>
            <Text size="none">windows_month_hint</Text>
        </div>
    </Flex>
}
