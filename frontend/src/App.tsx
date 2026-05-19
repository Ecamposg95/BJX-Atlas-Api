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
import { HomePage } from './pages/Home'
import { InventoryPage } from './pages/Inventory'
import { InventoryRequestsPage } from './pages/InventoryRequests'
import { WorkshopBoardPage } from './pages/WorkshopBoard'
import { MechanicWorkPage } from './pages/MechanicWork'
import { MechanicHomeV1 } from './pages/MechanicHomeV1'
import { OperationalDashboardPage } from './pages/OperationalDashboard'
import { BranchesPage } from './pages/Branches'
import { ToastProvider } from './components/ui/ToastProvider'
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
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/home" replace />} />
              <Route path="/home" element={<HomePage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/calculator" element={<CalculatorPage />} />
              <Route path="/quotes" element={<QuotesPage />} />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/suppliers" element={<SuppliersPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/inventory/requests" element={<InventoryRequestsPage />} />
              <Route path="/workshop/board" element={<WorkshopBoardPage />} />
              <Route path="/me/work" element={<MechanicWorkPage />} />
              <Route path="/mechanic" element={<MechanicHomeV1 />} />
              <Route path="/dashboard/operational" element={<OperationalDashboardPage />} />
              <Route path="/branches" element={<BranchesPage />} />
              <Route path="/config" element={<ConfigPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
