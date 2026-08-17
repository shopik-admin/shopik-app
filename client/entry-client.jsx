import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { routes } from './routes'

const router = createBrowserRouter(routes)

ReactDOM.hydrateRoot(
    document.getElementById('root'),
    <React.StrictMode>
        <RouterProvider router={router} />
    </React.StrictMode>
)