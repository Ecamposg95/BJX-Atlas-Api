import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/Login'
import { DashboardPage } from './pages/Dashboard'
import { CalculatorPage } from './pages/Calculator'
import { QuotesPage } from './pages/Quotes'
import { CatalogPage } from './pages/Catalog'
import { SuppliersPage } from './pages/Suppliers'
import { ConfigPage } from './pages/Config'
import { AdminPage } from './pages/Admin'
import { applyTheme, useThemeStore } from './store/theme'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

export default function App() {
  const theme = useThemeStore((state) => state.theme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/calculator" element={<CalculatorPage />} />
            <Route path="/quotes" element={<QuotesPage />} />
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/suppliers" element={<SuppliersPage />} />
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
