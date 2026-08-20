import https from 'https'
import { Storage } from '@google-cloud/storage'
import { JWT } from 'google-auth-library'
import log from '#server/utils/log.js'

let bucket

function getBucket() {
    if (!bucket) {
        const { STORAGE_SA_KEY, UPLOAD_BUCKET } = process.env
        if (!STORAGE_SA_KEY || !UPLOAD_BUCKET)
            throw new Error('STORAGE_SA_KEY and UPLOAD_BUCKET env vars are required')

        let credentials
        try {
            credentials = JSON.parse(STORAGE_SA_KEY)
        } catch {
            throw new Error('STORAGE_SA_KEY is not valid JSON')
        }

        const authClient = new JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/devstorage.full_control'],
            // node-fetch + keep-alive against Google servers raises
            // ERR_STREAM_PREMATURE_CLOSE on the token exchange — disable keep-alive.
            transporterOptions: { agent: new https.Agent({ keepAlive: false }) }
        })

        const storage = new Storage({ authClient, projectId: credentials.project_id })
        bucket = storage.bucket(UPLOAD_BUCKET)
        log.info(`[Storage] Using bucket: ${UPLOAD_BUCKET}`)
    }
    return bucket
}

const storage = {
    getBucket,
    async uploadFile({ path, data, contentType, cacheControl }) {
        const file = getBucket().file(path)
        await file.save(data, {
            contentType,
            metadata: cacheControl ? { cacheControl } : undefined
        })
        return path
    }
}

export default storage