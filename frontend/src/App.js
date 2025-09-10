import React, { useState, useEffect } from 'react';
import Login from './Login';
import Signup from './Signup';
import Dashboard from './Dashboard';
import StockOnboarding from './StockOnboarding';
import ViewCurrentStock from './ViewCurrentStock';
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
import AddSupplier from './AddSupplier';
import ShiftTransfer from './ShiftTransfer';
import StockTransferReport from './StockTransferReport';
import './App.css';
import API_BASE_URL from './config';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState('login');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    const token = localStorage.getItem('token');
    
    if (token) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/verify-token`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          setIsAuthenticated(true);
          setCurrentView('dashboard');
        } else {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setIsAuthenticated(false);
          setCurrentView('login');
        }
      } catch (error) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setIsAuthenticated(false);
        setCurrentView('login');
      }
    } else {
      setIsAuthenticated(false);
      setCurrentView('login');
    }
    setLoading(false);
  };

  const handleLogin = (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setIsAuthenticated(true);
    setCurrentView('dashboard');
  };

  const handleNavigate = (view) => {
    setCurrentView(view);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setCurrentView('login');
  };

  if (loading) {
    return <div>Loading...</div>;
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
          />
        )}
      </div>
    );
  }

  return (
    <div className="App">
      {currentView === 'dashboard' && (
        <Dashboard onNavigate={handleNavigate} onLogout={handleLogout} />
      )}
      {currentView === 'stockOnboarding' && (
        <StockOnboarding onNavigate={handleNavigate} onLogout={handleLogout} />
      )}
      {currentView === 'viewCurrentStock' && (
        <ViewCurrentStock onNavigate={handleNavigate} onLogout={handleLogout} />
      )}
      {currentView === 'manageStock' && (
        <ManageStock onNavigate={handleNavigate} onLogout={handleLogout} />
      )}
      {currentView === 'uploadInvoice' && (
        <UploadInvoice onNavigate={handleNavigate} onLogout={handleLogout} />
      )}
      {currentView === 'sheets' && (
        <Sheets onNavigate={handleNavigate} onLogout={handleLogout} />
      )}
      {currentView === 'updateClosingStock' && (
        <UpdateClosingStock onNavigate={handleNavigate} onLogout={handleLogout} />
      )}
      {currentView === 'incomeExpenses' && (
        <IncomeExpenses onNavigate={handleNavigate} onLogout={handleLogout} />
      )}
      {currentView === 'incomeExpensesReport' && (
        <IncomeExpensesReport onNavigate={handleNavigate} onLogout={handleLogout} />
      )}
      {currentView === 'trackPayments' && (
        <TrackPayments onNavigate={handleNavigate} onLogout={handleLogout} />
      )}
      {currentView === 'downloadSaleSheet' && (
        <DownloadSaleSheet onNavigate={handleNavigate} onLogout={handleLogout} />
      )}
      {currentView === 'reports' && (
        <Reports onNavigate={handleNavigate} onLogout={handleLogout} />
      )}
      {currentView === 'stockLifted' && (
        <StockLifted onNavigate={handleNavigate} onLogout={handleLogout} />
      )}
      {currentView === 'brandWiseSales' && (
        <SalesReport onNavigate={handleNavigate} onLogout={handleLogout} />
      )}
      {currentView === 'addSupplier' && (
        <AddSupplier onNavigate={handleNavigate} onLogout={handleLogout} />
      )}
      {currentView === 'shiftTransfer' && (
        <ShiftTransfer onNavigate={handleNavigate} onLogout={handleLogout} />
      )}
      {currentView === 'stockTransferReport' && (
        <StockTransferReport onNavigate={handleNavigate} onLogout={handleLogout} />
      )}
    </div>
  );
}

export default App;
