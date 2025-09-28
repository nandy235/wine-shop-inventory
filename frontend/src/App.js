import React, { useState, useEffect } from 'react';
import Login from './Login';
import Signup from './Signup';
import Home from './Home';
import StockOnboarding from './StockOnboarding';
import ManageStock from './ManageStock';
import UploadInvoice from './UploadInvoice';
import Sheets from './Sheets';
import UpdateClosingStock from './UpdateClosingStock';
import IncomeExpenses from './IncomeExpenses';
import IncomeExpensesReport from './IncomeExpensesReport';
import TrackPayments from './TrackPayments';
import DownloadSaleSheet from './DownloadSaleSheet';
import Reports from './Reports';
import StockLifted from './StockLifted';
import SalesReport from './SalesReport';
import AddStore from './AddStore';
import ShiftTransfer from './ShiftTransfer';
import StockTransferReport from './StockTransferReport';
import './App.css';
import { AuthProvider, useAuthContext } from './contexts/AuthContext';
import { UserProvider } from './contexts/UserContext';

// Main App component that uses contexts
function AppContent() {
  const [currentView, setCurrentView] = useState('login');
  const { isAuthenticated, loading, handleLogin, handleLogout, handleAuthError } = useAuthContext();

  // Initialize view from URL on app load
  useEffect(() => {
    const path = window.location.pathname;
    const viewFromPath = getViewFromPath(path);
    if (viewFromPath && viewFromPath !== currentView) {
      setCurrentView(viewFromPath);
    } else if (!viewFromPath && path !== '/') {
      // If URL doesn't match any known route, redirect to home if authenticated, login if not
      const defaultView = isAuthenticated ? 'home' : 'login';
      handleNavigate(defaultView);
    }
  }, [isAuthenticated]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = (event) => {
      const path = window.location.pathname;
      const viewFromPath = getViewFromPath(path);
      if (viewFromPath) {
        setCurrentView(viewFromPath);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Helper function to map URL paths to views
const getViewFromPath = (path) => {
const pathMap = {
      '/': 'home',
      '/login': 'login',
      '/signup': 'signup',
      '/home': 'home',
      '/dashboard': 'home', // Keep for backward compatibility
      '/stock-onboarding': 'stockOnboarding',
      '/manage-stock': 'manageStock',
      '/upload-invoice': 'uploadInvoice',
      '/sheets': 'sheets',
      '/update-closing-stock': 'updateClosingStock',
      '/income-expenses': 'incomeExpenses',
      '/income-expenses-report': 'incomeExpensesReport',
      '/track-payments': 'trackPayments',
      '/download-sale-sheet': 'downloadSaleSheet',
      '/reports': 'reports',
      '/stock-lifted': 'stockLifted',
      '/sales-report': 'brandWiseSales',
      '/add-store': 'addStore',
      '/shift-transfer': 'shiftTransfer',
      '/stock-transfer-report': 'stockTransferReport'
    };
    return pathMap[path] || null;
  };

  // Helper function to map views to URL paths
  const getPathFromView = (view) => {
    const viewMap = {
      'login': '/login',
      'signup': '/signup',
      'home': '/home',
      'stockOnboarding': '/stock-onboarding',
      'manageStock': '/manage-stock',
      'uploadInvoice': '/upload-invoice',
      'sheets': '/sheets',
      'updateClosingStock': '/update-closing-stock',
      'incomeExpenses': '/income-expenses',
      'incomeExpensesReport': '/income-expenses-report',
      'trackPayments': '/track-payments',
      'downloadSaleSheet': '/download-sale-sheet',
      'reports': '/reports',
      'stockLifted': '/stock-lifted',
      'brandWiseSales': '/sales-report',
      'addStore': '/add-store',
      'shiftTransfer': '/shift-transfer',
      'stockTransferReport': '/stock-transfer-report'
    };
    return viewMap[view] || '/home';
  };

  const handleNavigate = (view) => {
    const path = getPathFromView(view);
    window.history.pushState({ view }, '', path);
    setCurrentView(view);
  };

  // Update view based on authentication status
  useEffect(() => {
    if (isAuthenticated && currentView === 'login') {
      handleNavigate('home');
    } else if (!isAuthenticated && currentView !== 'login' && currentView !== 'signup') {
      handleNavigate('login');
    }
  }, [isAuthenticated, currentView]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="App">
        {currentView === 'login' && (
          <Login 
            onLogin={handleLogin} 
            onSignup={() => handleNavigate('signup')} 
          />
        )}
        {currentView === 'signup' && (
          <Signup 
            onLogin={() => handleNavigate('login')} 
            onSignup={() => handleNavigate('login')} 
          />
        )}
      </div>
    );
  }

  return (
    <UserProvider isAuthenticated={isAuthenticated} onAuthError={handleAuthError}>
      <div className="App">
        {currentView === 'home' && (
          <Home 
            onNavigate={handleNavigate} 
            onLogout={handleLogout} 
          />
        )}
        {currentView === 'stockOnboarding' && (
          <StockOnboarding 
            onNavigate={handleNavigate} 
            onLogout={handleLogout} 
            isAuthenticated={isAuthenticated}
          />
        )}
        {currentView === 'manageStock' && (
          <ManageStock 
            onNavigate={handleNavigate} 
            onLogout={handleLogout} 
          />
        )}
        {currentView === 'uploadInvoice' && (
          <UploadInvoice 
            onNavigate={handleNavigate} 
            onLogout={handleLogout} 
          />
        )}
        {currentView === 'sheets' && (
          <Sheets 
            onNavigate={handleNavigate} 
            onLogout={handleLogout} 
          />
        )}
        {currentView === 'updateClosingStock' && (
          <UpdateClosingStock 
            onNavigate={handleNavigate} 
            onLogout={handleLogout} 
          />
        )}
        {currentView === 'incomeExpenses' && (
          <IncomeExpenses 
            onNavigate={handleNavigate} 
            onLogout={handleLogout} 
          />
        )}
        {currentView === 'incomeExpensesReport' && (
          <IncomeExpensesReport 
            onNavigate={handleNavigate} 
            onLogout={handleLogout} 
          />
        )}
        {currentView === 'trackPayments' && (
          <TrackPayments 
            onNavigate={handleNavigate} 
            onLogout={handleLogout} 
          />
        )}
        {currentView === 'downloadSaleSheet' && (
          <DownloadSaleSheet 
            onNavigate={handleNavigate} 
            onLogout={handleLogout} 
          />
        )}
        {currentView === 'reports' && (
          <Reports 
            onNavigate={handleNavigate} 
            onLogout={handleLogout} 
          />
        )}
        {currentView === 'stockLifted' && (
          <StockLifted 
            onNavigate={handleNavigate} 
            onLogout={handleLogout} 
          />
        )}
        {currentView === 'brandWiseSales' && (
          <SalesReport 
            onNavigate={handleNavigate} 
            onLogout={handleLogout} 
          />
        )}
        {currentView === 'addStore' && (
          <AddStore 
            onNavigate={handleNavigate} 
            onLogout={handleLogout} 
          />
        )}
        {currentView === 'shiftTransfer' && (
          <ShiftTransfer 
            onNavigate={handleNavigate} 
            onLogout={handleLogout} 
          />
        )}
        {currentView === 'stockTransferReport' && (
          <StockTransferReport 
            onNavigate={handleNavigate} 
            onLogout={handleLogout} 
          />
        )}
      </div>
    </UserProvider>
  );
}

// Root App component with context providers
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;