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
import { HomeRedirect } from './pages/HomeRedirect'
import { ExecutivePage } from './pages/Executive'
import { ManagerPage } from './pages/Manager'
import { WorkshopPage } from './pages/Workshop'
import { ClientCorpPage } from './pages/ClientCorp'
import { InventoryPage } from './pages/Inventory'
import { WarehouseHomePage } from './pages/WarehouseHome'
import { WarehouseRequestDetailPage } from './pages/WarehouseRequestDetail'
import { WarehouseReceivePage } from './pages/WarehouseReceive'
import { WorkshopBoardPage } from './pages/WorkshopBoard'
import { MechanicHomeV1 } from './pages/MechanicHomeV1'
import { MechanicTaskDetailPage } from './pages/MechanicTaskDetail'
import { OperationalDashboardPage } from './pages/OperationalDashboard'
import { BranchesPage } from './pages/Branches'
import { ClientPortalPage } from './pages/ClientPortal'
import { AdvisorHomePage } from './pages/AdvisorHome'
import { AdvisorCheckInPage } from './pages/AdvisorCheckIn'
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
            <Route path="/client/:folio" element={<ClientPortalPage />} />
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/home" replace />} />
              <Route path="/home" element={<HomeRedirect />} />
              <Route path="/executive" element={<ExecutivePage />} />
              <Route path="/manager" element={<ManagerPage />} />
              <Route path="/workshop" element={<WorkshopPage />} />
              <Route path="/client-corp" element={<ClientCorpPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/calculator" element={<CalculatorPage />} />
              <Route path="/quotes" element={<QuotesPage />} />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/suppliers" element={<SuppliersPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/warehouse" element={<WarehouseHomePage />} />
              <Route path="/warehouse/requests/:id" element={<WarehouseRequestDetailPage />} />
              <Route path="/warehouse/receive/:requestId" element={<WarehouseReceivePage />} />
              <Route path="/workshop/board" element={<WorkshopBoardPage />} />
              <Route path="/mechanic" element={<MechanicHomeV1 />} />
              <Route path="/mechanic/tasks/:lineId" element={<MechanicTaskDetailPage />} />
              <Route path="/advisor" element={<AdvisorHomePage />} />
              <Route path="/advisor/check-in" element={<AdvisorCheckInPage />} />
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
