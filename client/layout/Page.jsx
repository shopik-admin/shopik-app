import { useLoaderData, useParams, useNavigation, useRouteLoaderData } from 'react-router'

export function usePage() {
    const params = useParams()
    const navigation = useNavigation()

    const { initData = {} } = useRouteLoaderData('root') || {}

    const pageResult = useLoaderData() || {}

    return {
        params,
        initData,
        loading: navigation.state === 'loading',
        pageResult,
        ...pageResult
    }
}