import { seedHolidays } from '#server/cron/holidaySeed.js'

export default async function seed(payload, { DL }) {
    return seedHolidays(DL)
}

seed.config = {
    permissions: ['order_window_template:update']
}
