export default function classNames(...args) {
    return args.reduce((className, curr) => {
        let nc = ''
        if (Array.isArray(curr)) {
            const [n, c] = curr
            if (c) nc = n
        }
        else
            nc = curr
        return className += (nc ? `${nc} ` : '')
    }, '')
}