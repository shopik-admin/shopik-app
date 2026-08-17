const colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m'
}

const log = (...args) => console.log(...args)

log.warn = (msg, ...args) =>
    console.log(`${colors.yellow}${msg}${colors.reset}`, ...args)

log.error = (msg, ...args) =>
    console.log(`${colors.red}${msg}${colors.reset}`, ...args)

log.info = (msg, ...args) =>
    console.log(`${colors.blue}${msg}${colors.reset}`, ...args)

log.success = (msg, ...args) =>
    console.log(`${colors.green}${msg}${colors.reset}`, ...args)

log.colors = (cb) =>
    console.log(cb(colors) + colors.reset)

export default log