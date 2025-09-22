import React, { useState } from 'react';
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

  const handleNavigate = (view) => {
    setCurrentView(view);
  };

  // Update view based on authentication status
  React.useEffect(() => {
    if (isAuthenticated && currentView === 'login') {
      setCurrentView('dashboard');
    } else if (!isAuthenticated && currentView !== 'login' && currentView !== 'signup') {
      setCurrentView('login');
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
            onSignup={() => setCurrentView('signup')} 
          />
        )}
        {currentView === 'signup' && (
          <Signup 
            onLogin={() => setCurrentView('login')} 
            onSignup={() => setCurrentView('login')} 
          />
        )}
      </div>
    );
  }

  return (
    <UserProvider isAuthenticated={isAuthenticated} onAuthError={handleAuthError}>
      <div className="App">
        {currentView === 'dashboard' && (
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