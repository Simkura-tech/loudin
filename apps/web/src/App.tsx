/**
 * Root application component.
 *
 * Wraps the app in Emotion's ThemeProvider so styled components and primitives
 * can read tokens via `theme`. Adds GlobalStyles for the CSS reset + base
 * typography. AuthProvider hydrates the current session from /api/auth/me on
 * mount so children can read `useAuth()`.
 */

import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@emotion/react';
import { branding } from './branding';
import { lightTheme, GlobalStyles } from './theme';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import NotFoundPage from './pages/marketing/NotFoundPage';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import AppLayout from './layouts/AppLayout';
import OverviewPage from './pages/app/OverviewPage';
import DirectoryPage from './pages/app/platform/DirectoryPage';
import CompanyDetailPage from './pages/app/CompanyDetailPage';
import ResellerCustomersPage from './pages/app/reseller/CustomersPage';
import ResellerCustomerDetailPage from './pages/app/reseller/CustomerDetailPage';
import ResellerFleetPage from './pages/app/reseller/FleetPage';
import PeoplePage from './pages/app/PeoplePage';
import PersonDetailPage from './pages/app/PersonDetailPage';
import DevicesPage from './pages/app/DevicesPage';
import DeviceDetailPage from './pages/app/DeviceDetailPage';
import SettingsLayout from './pages/app/settings/SettingsLayout';
import WorkspaceSettings from './pages/app/settings/WorkspaceSettings';
import ProfileSettings from './pages/app/settings/ProfileSettings';
import SecuritySettings from './pages/app/settings/SecuritySettings';
import PlatformApiKeysPage from './pages/app/PlatformApiKeysPage';
import PlatformDocumentsPage from './pages/app/PlatformDocumentsPage';
import DeviceTestingPage from './pages/app/platform/DeviceTestingPage';
import TermsPage from './pages/legal/TermsPage';
import PrivacyPage from './pages/legal/PrivacyPage';
import './styles/index.css';

function App() {
  // Branded browser-tab title. index.html ships a neutral fallback (it can't
  // import TS), so the real title is set here from src/branding.ts as soon as
  // the app mounts; MarketingLayout then overrides it per page.
  useEffect(() => {
    document.title = `${branding.productName} — ${branding.tagline}`;
  }, []);

  return (
    <ThemeProvider theme={lightTheme}>
      <GlobalStyles />
      <Router>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/signup" element={<SignupPage />} />

            <Route path="/terms"   element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />

            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<OverviewPage />} />
              <Route path="companies"     element={<DirectoryPage />} />
              <Route path="companies/:id" element={<CompanyDetailPage />} />
              <Route path="customers"     element={<ResellerCustomersPage />} />
              <Route path="customers/:id" element={<ResellerCustomerDetailPage />} />
              <Route path="fleet"         element={<ResellerFleetPage />} />
              <Route path="people" element={<PeoplePage />} />
              <Route path="people/:id" element={<PersonDetailPage />} />
              <Route path="devices" element={<DevicesPage />} />
              <Route path="devices/:id" element={<DeviceDetailPage />} />
              <Route path="platform/api-keys" element={<PlatformApiKeysPage />} />
              <Route path="platform/documents" element={<PlatformDocumentsPage />} />
              <Route path="platform/device-testing" element={<DeviceTestingPage />} />
              <Route path="settings" element={<SettingsLayout />}>
                <Route index element={<Navigate to="workspace" replace />} />
                <Route path="workspace" element={<WorkspaceSettings />} />
                <Route path="profile"   element={<ProfileSettings />} />
                <Route path="security"  element={<SecuritySettings />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AuthProvider>
      </Router>
    </ThemeProvider>
  );
}

export default App;
