import React, { useState, useEffect, useCallback } from 'react';
import './Dashboard.css';
import API_BASE_URL from './config';
import SettingsDropdown from './SettingsDropdown';

// Helper function to get business date (day starts at 11:30 AM IST)
function getBusinessDate() {
  const now = new Date();
  
  // Check if browser is already in IST timezone
  const browserTimezoneOffset = now.getTimezoneOffset();
  const istTimezoneOffset = -330; // IST is UTC+5:30, so offset is -330 minutes
  
  let istTime;
  if (browserTimezoneOffset === istTimezoneOffset) {
    // Browser is already in IST (local machine), use current time
    istTime = now;
  } else {
    // Browser is in UTC or other timezone, convert to IST
    const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
    istTime = new Date(now.getTime() + istOffset);
  }
  
  if (istTime.getHours() < 11 || (istTime.getHours() === 11 && istTime.getMinutes() < 30)) {
    // Before 11:30 AM IST - use previous day
    const yesterday = new Date(istTime);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toLocaleDateString('en-CA');
  } else {
    // After 11:30 AM IST - use current day
    return istTime.toLocaleDateString('en-CA');
  }
}

function Dashboard({ onNavigate, onLogout }) {
  const [dashboardData, setDashboardData] = useState({
    stockValue: 0,
    stockLiftedInvoiceValue: 0,
    stockLiftedMrpValue: 0,
    todaysSale: 0,
    counterBalance: 0,
    totalAmountCollected: 0,
    balanceStatus: 'BALANCED'
  });
  const [loading, setLoading] = useState(true);
  const [businessDate, setBusinessDate] = useState(getBusinessDate());

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');
  const shopName = user.shopName || 'Liquor Ledger';

  // Monitor business date changes
  useEffect(() => {
    const checkBusinessDate = () => {
      const newBusinessDate = getBusinessDate();
      if (newBusinessDate !== businessDate) {
        setBusinessDate(newBusinessDate);
      }
    };

    // Check immediately
    checkBusinessDate();
    
    // Check every minute for business date changes
    const interval = setInterval(checkBusinessDate, 60000);
    
    return () => clearInterval(interval);
  }, [businessDate]);

  const fetchDashboardData = useCallback(async () => {
    try { 
      const initResponse = await fetch(`${API_BASE_URL}/api/stock/initialize-today`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (initResponse.ok) {
        const initData = await initResponse.json();
      }

      const response = await fetch(`${API_BASE_URL}/api/summary?date=${businessDate}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        setDashboardData({
          stockValue: data.stockValue || 0,      
          stockLiftedInvoiceValue: data.stockLiftedInvoiceValue || 0,
          stockLiftedMrpValue: data.stockLiftedMrpValue || 0,
          todaysSale: data.totalSales || 0,      
          counterBalance: data.counterBalance || 0,
          totalAmountCollected: data.totalAmountCollected || 0,
          balanceStatus: data.balanceStatus || 'BALANCED'
        });
      } else {
        console.error('Failed to fetch dashboard data:', response.status, response.statusText);
        setDashboardData({
          stockValue: 0,
          stockLiftedInvoiceValue: 0,
          stockLiftedMrpValue: 0,
          todaysSale: 0,
          counterBalance: 0,
          totalAmountCollected: 0,
          balanceStatus: 'BALANCED'
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setDashboardData({
        stockValue: 0,
        stockLiftedInvoiceValue: 0,
        stockLiftedMrpValue: 0,
        todaysSale: 0,
        counterBalance: 0,
        totalAmountCollected: 0,
        balanceStatus: 'BALANCED'
      });
    }
    setLoading(false);
  }, [businessDate, token]);

  // Fetch data when business date changes
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Refresh dashboard data every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = () => {
    // Show business date for display
    const date = new Date(businessDate);
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'long' });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  const formatBusinessDate = () => {
    // Format business date as DD-MM-YYYY
    const date = new Date(businessDate);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="logo-section">
          <h1 className="app-title">{shopName}</h1>
          <p className="app-subtitle">Inventory Management</p>
        </div>
        <nav className="navigation">
          <button className="nav-button active">Dashboard</button>
          <button className="nav-button" onClick={() => onNavigate('stockOnboarding')}>Stock Onboarding</button>
          <button className="nav-button" onClick={() => onNavigate('manageStock')}>Manage Stock</button>
          <button className="nav-button" onClick={() => onNavigate('sheets')}>Sheets</button>
          <button className="nav-button" onClick={() => onNavigate('reports')}>Reports</button>
          <SettingsDropdown onLogout={onLogout} />
        </nav>
      </header>
      
      <main className="dashboard-content">
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="page-title">Dashboard Overview</h2>
          <p className="business-date-right" style={{ margin: 0, marginRight: '20px', fontSize: '16px', fontWeight: 'bold' }}>Business Date: {formatBusinessDate()}</p>
        </div>
        
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-icon purple">📦</div>
            <div className="metric-info">
              <h3 className="metric-title">Stock Value</h3>
              <p className="metric-value">{formatCurrency(dashboardData.stockValue)}</p>
              <p className="metric-subtitle">Current inventory value</p>
            </div>
          </div>
          
          <div className="metric-card">
            <div className="metric-icon purple">📤</div>
            <div className="metric-info">
              <h3 className="metric-title">Stock Lifted</h3>
              <div className="dual-value">
                <div className="value-row">
                  <span className="value-label">Invoice:</span>
                  <span className="metric-value">{formatCurrency(dashboardData.stockLiftedInvoiceValue)}</span>
                </div>
                <div className="value-row">
                  <span className="value-label">MRP:</span>
                  <span className="metric-value">{formatCurrency(dashboardData.stockLiftedMrpValue)}</span>
                </div>
              </div>
              <p className="metric-subtitle">This month's cumulative values</p>
            </div>
          </div>
          
          <div className="metric-card">
            <div className="metric-icon green">📈</div>
            <div className="metric-info">
              <h3 className="metric-title">Today's Sale</h3>
              <p className="metric-value">{formatCurrency(dashboardData.todaysSale)}</p>
              <p className="metric-subtitle">Sales for today</p>
            </div>
          </div>
          
          <div className="metric-card">
            <div className="metric-icon orange">💰</div>
            <div className="metric-info">
              <h3 className="metric-title">Counter Balance</h3>
              <p className="metric-value">{formatCurrency(dashboardData.counterBalance)}</p>
              <p className="metric-subtitle">
                {dashboardData.balanceStatus === 'SHORT' ? 'Cash Short' : 
                 dashboardData.balanceStatus === 'SURPLUS' ? 'Cash Surplus' : 'Balanced'}
              </p>
            </div>
          </div>
        </div>

        <div className="quick-actions-section">
          <h2 className="Dashboard-section-title">Quick Actions</h2>
          <div className="quick-actions-grid">
            <div 
              className="action-card"
              onClick={() => onNavigate('uploadInvoice')}
              style={{ cursor: 'pointer' }}
            >
              <div className="action-icon purple">📤</div>
              <div className="action-info">
                <h3 className="action-title">Upload Invoice</h3>
              </div>
            </div>
            
            <div 
              className="action-card"
              onClick={() => onNavigate('updateClosingStock')}
              style={{ cursor: 'pointer' }}
            >
              <div className="action-icon purple">📝</div>
              <div className="action-info">
                <h3 className="action-title">Update Closing Stock</h3>
              </div>
            </div>
            
            <div 
              className="action-card"
              onClick={() => onNavigate('incomeExpenses')}
              style={{ cursor: 'pointer' }}
            >
              <div className="action-icon purple">💰</div>
              <div className="action-info">
                <h3 className="action-title">Income/Expenses</h3>
              </div>
            </div>
            
            <div 
              className="action-card"
              onClick={() => onNavigate('downloadSaleSheet')}
              style={{ cursor: 'pointer' }}
            >
              <div className="action-icon purple">📊</div>
              <div className="action-info">
                <h3 className="action-title">Download Sale Sheet</h3>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;