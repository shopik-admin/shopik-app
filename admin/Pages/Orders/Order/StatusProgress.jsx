import classNames from 'common/functions/classNames'
import Icon from 'common/components/Icon'
import Text from 'common/components/Text'
import Flex from 'common/components/Flex'
import styles from './order.module.css'

// cart is not part of the progress timeline; paid-edit counts as paid
export const ORDER_STEPS = ['paid', 'picking', 'picked', 'packed', 'shipped', 'done']
const FAILED_STATUSES = ['canceled', 'failed']
const STEP_ICONS = {
    paid: 'card',
    picking: 'stock',
    picked: 'check',
    packed: 'box',
    shipped: 'truck',
    done: 'v',
    canceled: 'x',
    failed: 'x'
}

/**
 * Resolves the visible steps of an order.
 * Regular orders show the full pipeline with the current status highlighted.
 * Canceled/failed orders show only the statuses they actually went through
 * (from the timeline) followed by a red terminal step.
 */
export function getStepsState(status, timeline = []) {
    if (!FAILED_STATUSES.includes(status))
        return { steps: ORDER_STEPS, current: Math.max(ORDER_STEPS.indexOf(status === 'paid-edit' ? 'paid' : status), 0), failedStep: null }

    const passed = new Set(timeline
        .filter(entry => entry.event?.type === 'order_status')
        .map(entry => entry.changes?.newData?.status))
    const steps = ORDER_STEPS.filter(step => passed.has(step))
    if (steps.length === 0 && timeline.length === 0) steps.push('paid')
    return { steps: [...steps, status], current: steps.length, failedStep: steps.length }
}

export default function StatusProgress({ status, timeline }) {
    const { steps, current, failedStep } = getStepsState(status, timeline)

    return <Flex grow className={styles.stepper}>
        {steps.map((step, i) => {
            const isDone = i < current
            const isCurrent = i === current
            const isFailedStep = failedStep != null && i === failedStep
            return <Flex col key={step} grow className={classNames(styles.step, isDone && styles.stepDone, isCurrent && styles.stepCurrent, isFailedStep && styles.stepFailed)}>
                {i > 0 && <div className={classNames(styles.stepLine,
                    !isFailedStep && (isDone || isCurrent) && styles.stepLineActive,
                    (isFailedStep || (isCurrent && failedStep != null)) && styles.stepLineFailed)} />}
                <div className={styles.stepDot}>
                    {isCurrent && !isFailedStep
                        ? <div className={styles.stepDotInner} />
                        : <Icon name={isFailedStep ? STEP_ICONS[status] : (isDone ? 'v' : STEP_ICONS[step])} size={isDone || isFailedStep ? 14 : 13} />}
                </div>
                <Text size='m' bold mode={isDone || isCurrent ? undefined : 'sub'} className={classNames(isFailedStep && styles.stepFailedText, isCurrent && styles.stepCurrentText)}>{step}</Text>
            </Flex>
        })}
    </Flex>
}
