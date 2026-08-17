import React from 'react'
import App from './App'
import pages from 'pages'

export const routes = [
    {
        id: 'root',
        path: '/',
        element: <App />,
        loader: async () => {
            return { initData: {} } // global data
        },
        children: pages.map(page => ({
            index: page.path === '/',
            path: page.path === '/' ? undefined : page.path,
            element: page.element,
            loader: async ({ params, request }) => {
                const component = page.element.type;
                if (component && typeof component.init === 'function') {
                    const data = await component.init({ params, request });
                    return data;
                }
                return null;
            }
        }))
    }
]
