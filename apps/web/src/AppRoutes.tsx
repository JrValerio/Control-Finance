import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import App from "./pages/App";
import BillingSettings from "./pages/BillingSettings";
import BillsPage from "./pages/BillsPage";
import CategoriesSettings from "./pages/CategoriesSettings";
import Login from "./pages/Login";
import ProfileSettings from "./pages/ProfileSettings";
import SecuritySettings from "./pages/SecuritySettings";
import ProtectedRoute from "./routers/ProtectedRoute";
import { useAuth } from "./hooks/useAuth";

const Dashboard = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const handleOpenCategoriesSettings = () => {
    navigate("/app/settings/categories");
  };

  const handleOpenBillingSettings = () => {
    navigate("/app/settings/billing");
  };

  const handleOpenProfileSettings = () => {
    navigate("/app/settings/profile");
  };

  const handleOpenSecuritySettings = () => {
    navigate("/app/settings/security");
  };

  const handleOpenBills = () => {
    navigate("/app/bills");
  };

  return (
    <App
      onLogout={handleLogout}
      onOpenCategoriesSettings={handleOpenCategoriesSettings}
      onOpenBillingSettings={handleOpenBillingSettings}
      onOpenProfileSettings={handleOpenProfileSettings}
      onOpenSecuritySettings={handleOpenSecuritySettings}
      onOpenBills={handleOpenBills}
    />
  );
};

const CategoriesSettingsRoute = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleBack = () => {
    navigate("/app");
  };

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  return <CategoriesSettings onBack={handleBack} onLogout={handleLogout} />;
};

const BillingSettingsRoute = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleBack = () => {
    navigate("/app");
  };

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  return <BillingSettings onBack={handleBack} onLogout={handleLogout} />;
};

const ProfileSettingsRoute = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleBack = () => {
    navigate("/app");
  };

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  return <ProfileSettings onBack={handleBack} onLogout={handleLogout} />;
};

const SecuritySettingsRoute = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleBack = () => {
    navigate("/app");
  };

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  return <SecuritySettings onBack={handleBack} onLogout={handleLogout} />;
};

const BillsRoute = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleBack = () => {
    navigate("/app");
  };

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  return <BillsPage onBack={handleBack} onLogout={handleLogout} />;
};

const RootRedirect = () => {
  const { isAuthenticated } = useAuth();

  return <Navigate to={isAuthenticated ? "/app" : "/"} replace />;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/settings/categories"
        element={
          <ProtectedRoute>
            <CategoriesSettingsRoute />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/settings/billing"
        element={
          <ProtectedRoute>
            <BillingSettingsRoute />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/settings/profile"
        element={
          <ProtectedRoute>
            <ProfileSettingsRoute />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/settings/security"
        element={
          <ProtectedRoute>
            <SecuritySettingsRoute />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/bills"
        element={
          <ProtectedRoute>
            <BillsRoute />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
};

export default AppRoutes;
