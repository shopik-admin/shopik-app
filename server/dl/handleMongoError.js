export default function handleMongoError(e) {
    if (e.code === 11000) {
        const field = Object.keys(e.keyPattern).join(', ')
        const error = new Error(`Duplicate key [${field}]`)
        error.status = 409
        throw error
    } else if (e.errors) {
        const errorEntries = Object.entries(e.errors)
        const errorMessage = errorEntries.map(err => {
            const [field, { message }] = err
            return `[${field}]: ${message}`
        }).join(' ')
        const error = new Error(errorMessage)
        error.status = 400
        throw error
    }
    const err = new Error('Database error')
    err.code = e.code
    throw err
}
