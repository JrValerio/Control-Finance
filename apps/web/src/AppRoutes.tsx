import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import App from "./pages/App";
import BillingSettings from "./pages/BillingSettings";
import BillsPage from "./pages/BillsPage";
import CategoriesSettings from "./pages/CategoriesSettings";
import CreditCardsPage from "./pages/CreditCardsPage";
import IncomeSourcesPage from "./pages/IncomeSourcesPage";
import ForgotPassword from "./pages/ForgotPassword";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import ProfileSettings from "./pages/ProfileSettings";
import SecuritySettings from "./pages/SecuritySettings";
import TaxPage from "./pages/TaxPage";
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

  const handleOpenCreditCards = () => {
    navigate("/app/credit-cards");
  };

  const handleOpenIncomeSources = () => {
    navigate("/app/income-sources");
  };

  const handleOpenTax = () => {
    navigate("/app/tax");
  };

  return (
    <App
      onLogout={handleLogout}
      onOpenCategoriesSettings={handleOpenCategoriesSettings}
      onOpenBillingSettings={handleOpenBillingSettings}
      onOpenProfileSettings={handleOpenProfileSettings}
      onOpenSecuritySettings={handleOpenSecuritySettings}
      onOpenBills={handleOpenBills}
      onOpenCreditCards={handleOpenCreditCards}
      onOpenIncomeSources={handleOpenIncomeSources}
      onOpenTax={handleOpenTax}
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

  const handleOpenBilling = () => {
    navigate("/app/settings/billing");
  };

  return (
    <ProfileSettings
      onBack={handleBack}
      onLogout={handleLogout}
      onOpenBilling={handleOpenBilling}
    />
  );
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

const CreditCardsRoute = () => {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate("/app");
  };

  return <CreditCardsPage onBack={handleBack} />;
};

const IncomeSourcesRoute = () => {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate("/app");
  };

  return <IncomeSourcesPage onBack={handleBack} />;
};

const TaxRoute = () => {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate("/app");
  };

  return <TaxPage onBack={handleBack} />;
};

const RootRedirect = () => {
  const { isAuthenticated } = useAuth();

  return <Navigate to={isAuthenticated ? "/app" : "/"} replace />;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
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
      <Route
        path="/app/credit-cards"
        element={
          <ProtectedRoute>
            <CreditCardsRoute />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/income-sources"
        element={
          <ProtectedRoute>
            <IncomeSourcesRoute />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/tax"
        element={
          <ProtectedRoute>
            <TaxRoute />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/tax/:taxYear"
        element={
          <ProtectedRoute>
            <TaxRoute />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
};

export default AppRoutes;
