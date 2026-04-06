import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'
import { AdminShell } from './layout/AdminShell'
import { adminRoutes } from './routes/route-config'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/admin-dashboard" replace />,
  },
  ...adminRoutes.map((route) => ({
    path: route.path,
    element: <AdminShell>{route.element}</AdminShell>,
  })),
  {
    path: '*',
    element: <Navigate to="/admin-dashboard" replace />,
  },
])

export function App() {
  return <RouterProvider router={router} />
}