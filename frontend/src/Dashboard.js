import React, { useState, useEffect } from 'react';
import './Dashboard.css';
import API_BASE_URL from './config';

function Dashboard({ onNavigate }) {
  const [dashboardData, setDashboardData] = useState({
    stockValue: 0,
    stockLiftedInvoiceValue: 0,
    stockLiftedMrpValue: 0,
    todaysSale: 0,
    counterBalance: 0
  });
  const [loading, setLoading] = useState(true);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');
  const shopName = user.shopName || 'Liquor Ledger';

  const fetchDashboardData = async () => {
    try { 
      const initResponse = await fetch(`${API_BASE_URL}/api/stock/initialize-today`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (initResponse.ok) {
        const initData = await initResponse.json();
      }

      const response = await fetch(`${API_BASE_URL}/api/summary`, {
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
          counterBalance: data.counterBalance || 0
        });
      } else {
        setDashboardData({
          stockValue: 0,
          stockLiftedInvoiceValue: 0,
          stockLiftedMrpValue: 0,
          todaysSale: 0,
          counterBalance: 0
        });
      }
    } catch (error) {
      setDashboardData({
        stockValue: 0,
        stockLiftedInvoiceValue: 0,
        stockLiftedMrpValue: 0,
        todaysSale: 0,
        counterBalance: 0
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDashboardData();
    // Refresh dashboard data every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = () => {
    const date = new Date();
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'long' });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
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
          <button className="nav-button">Sheets</button>
          <button className="nav-button">Reports</button>
          <button className="nav-button">Settings</button>
        </nav>
      </header>
      
      <main className="dashboard-content">
        <div className="page-header">
          <h2 className="page-title">Dashboard Overview</h2>
          <p className="page-date"><strong>{formatDate()}</strong></p>
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
                {dashboardData.counterBalance >= 0 ? 'cash short' : 'cash surplus'}
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