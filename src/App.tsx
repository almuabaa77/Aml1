import React from 'react';
import { AuthProvider } from './hooks/useAuth';
import { LoginForm } from './components/auth/LoginForm';
import { MainLayout } from './components/layout/MainLayout';
import { Toaster } from './components/ui/sonner';
import { SecurityProvider } from './context/SecurityContext';
import { useAuth } from './hooks/useAuth';
import { useNotifications } from './hooks/useNotifications';
import { PWAInstallPrompt } from './components/common/PWAInstallPrompt';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { WelcomeScreen } from './components/WelcomeScreen';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  useNotifications(user?.uid);

  if (loading) {
    return <WelcomeScreen />;
  }

  return (
    <ErrorBoundary>
      {user ? <MainLayout /> : <LoginForm />}
    </ErrorBoundary>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <SecurityProvider>
        <AppContent />
        <Toaster position="top-center" expand={true} richColors />
      </SecurityProvider>
    </AuthProvider>
  );
}
