import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AuthGuard } from "@/components/AuthGuard";
import LoginPage from "./pages/LoginPage";
import AdminLayout from "./components/AdminLayout";
import EmployeeLayout from "./components/EmployeeLayout";
import AdminDashboard from "./pages/AdminDashboard";
import MetalInventory from "./pages/MetalInventory";
import CastingRecords from "./pages/CastingRecords";
import TransactionLog from "./pages/TransactionLog";
import AuditLog from "./pages/AuditLog";
import SettingsPage from "./pages/SettingsPage";
import AdminWarnings from "./pages/AdminWarnings";
import AdminStatistics from "./pages/AdminStatistics";
import AdminUsers from "./pages/AdminUsers";
import AdminLogs from "./pages/AdminLogs";
import EmployeeHome from "./pages/employee/EmployeeHome";
import EmployeeExtract from "./pages/employee/EmployeeExtract";
import EmployeePending from "./pages/employee/EmployeePending";
import EmployeeComplete from "./pages/employee/EmployeeComplete";
import EmployeeRecent from "./pages/employee/EmployeeRecent";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function RootRedirect() {
  const { user, role, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={role === 'admin' ? '/admin' : '/employee'} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<LoginPage />} />

            <Route path="/admin" element={<AuthGuard requiredRole="admin"><AdminLayout /></AuthGuard>}>
              <Route index element={<AdminDashboard />} />
              <Route path="inventory" element={<MetalInventory />} />
              <Route path="castings" element={<CastingRecords />} />
              <Route path="warnings" element={<AdminWarnings />} />
              <Route path="transactions" element={<TransactionLog />} />
              <Route path="statistics" element={<AdminStatistics />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="audit" element={<AuditLog />} />
              <Route path="settings" element={<SettingsPage />} />
              {/* Keep old route working */}
              <Route path="metals" element={<Navigate to="/admin/inventory" replace />} />
            </Route>

            <Route path="/employee" element={<AuthGuard><EmployeeLayout /></AuthGuard>}>
              <Route index element={<EmployeeHome />} />
              <Route path="extract/:metalId" element={<EmployeeExtract />} />
              <Route path="pending" element={<EmployeePending />} />
              <Route path="complete/:castingId" element={<EmployeeComplete />} />
              <Route path="recent" element={<EmployeeRecent />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
