import { Navigate, Route, Routes } from 'react-router-dom'

import AdminLayout from './layouts/AdminLayout'
import ClientLayout from './layouts/ClientLayout'
import ProtectedRoute from './components/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import Licenses from './pages/Licenses'
import Products from './pages/Products'
import Settings from './pages/Settings'
import Login from './pages/Login'
import ClientLogin from './pages/client/ClientLogin'
import ClientActivate from './pages/client/ClientActivate'
import ClientStatus from './pages/client/ClientStatus'
import ClientDetails from './pages/client/ClientDetails'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Public, product-facing screens. A product shows these in a frame in
          place of its own sign-in and license pages — see services/productLink.js. */}
      <Route path="/client" element={<ClientLayout />}>
        <Route index element={<Navigate to={{ pathname: 'login', search: window.location.search }} replace />} />
        <Route path="login" element={<ClientLogin />} />
        <Route path="activate" element={<ClientActivate />} />
        <Route path="status" element={<ClientStatus />} />
        <Route path="details" element={<ClientDetails />} />
        <Route path="*" element={<Navigate to="/client/login" replace />} />
      </Route>

      {/* Everything below requires an authenticated admin. */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="licenses" element={<Licenses />} />
          <Route path="products" element={<Products />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
