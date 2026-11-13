import { lazy } from 'react'
import type { RouteObject } from 'react-router-dom'

// Todo o painel é carregado sob demanda: visitantes da loja não baixam esse código.
const app = () => import('./AdminApp')
const AdminRoot = lazy(app)
const RequireAdmin = lazy(() => app().then((m) => ({ default: m.RequireAdmin })))
const AdminLayout = lazy(() => app().then((m) => ({ default: m.AdminLayout })))
const LoginPage = lazy(() => app().then((m) => ({ default: m.LoginPage })))
const ForgotPasswordPage = lazy(() => app().then((m) => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => app().then((m) => ({ default: m.ResetPasswordPage })))
const ProductForm = lazy(() => app().then((m) => ({ default: m.ProductFormKeyed })))
const DashboardPage = lazy(() => import('./DashboardPage'))
const ProductsPage = lazy(() => import('./ProductsPage'))
const CategoriesPage = lazy(() => import('./CategoriesPage'))
const ImportExportPage = lazy(() => import('./ImportExportPage'))
const SettingsPage = lazy(() => import('./SettingsPage'))

export const adminRoutes: RouteObject = {
  path: 'admin',
  element: <AdminRoot />,
  children: [
    { path: 'login', element: <LoginPage /> },
    { path: 'recuperar-senha', element: <ForgotPasswordPage /> },
    { path: 'redefinir-senha', element: <ResetPasswordPage /> },
    {
      element: <RequireAdmin />,
      children: [{
        element: <AdminLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'produtos', element: <ProductsPage /> },
          { path: 'produtos/novo', element: <ProductForm /> },
          { path: 'produtos/:id', element: <ProductForm /> },
          { path: 'categorias', element: <CategoriesPage /> },
          { path: 'importar', element: <ImportExportPage /> },
          { path: 'configuracoes', element: <SettingsPage /> },
          { path: '*', element: <p className="py-20 text-center text-ink-500">Página não encontrada.</p> },
        ],
      }],
    },
  ],
}
