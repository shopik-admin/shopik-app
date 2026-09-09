import { getMessages, getProduct, getMediaZip } from './client.js'
import { mapGs1ToProduct } from './mapper.js'

export default function gs1Factory() {
    return { getMessages, getProduct, getMediaZip, mapGs1ToProduct }
}
