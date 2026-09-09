import apiReq from '#common/functions/apiReq'
import { usePage } from 'layout/Page'
import DisplayBlocks from 'features/Display/DisplayBlocks'
import styles from './home.module.css'

export default function Home() {
    const { pageData } = usePage()
    return <div className={styles.home}>
        <DisplayBlocks blocks={pageData?.data?.blocks} />
    </div>
}

Home.init = async function init({ } = {}) {
    const data = await apiReq('display_block/get', { path: '/' }).catch(() => ({ blocks: [] }))
    return {
        title: 'home page',
        data
    }
}
