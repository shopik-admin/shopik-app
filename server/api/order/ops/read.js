import list from './list.js'

export default async function read(payload, ctx) {
    // alias for DataManager compatibility: DataProvider calls {apiRoute}/read
    return list(payload, ctx)
}

read.config = list.config
