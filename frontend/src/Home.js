import React, { useState, useEffect, useCallback } from 'react';
import './Home.css';
import { apiGet, apiPost } from './apiUtils';
import { getCurrentUser } from './authUtils';
import Navigation from './components/Navigation';

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

function Home({ onNavigate, onLogout }) {
  const [dashboardData, setDashboardData] = useState({
    stockValue: 0,
    stockLiftedInvoiceValue: 0,
    stockLiftedMrpValue: 0,
    todaysSale: 0,
    averageSales: 0,
    totalMonthlySales: 0,
    counterBalance: 0,
    totalAmountCollected: 0,
    balanceStatus: 'BALANCED'
  });
  const [loading, setLoading] = useState(true);
  const [businessDate, setBusinessDate] = useState(getBusinessDate());
  const [shopSignupDate, setShopSignupDate] = useState(null);
  const [isManualDate, setIsManualDate] = useState(false);

  // Get user data from authUtils for consistent display
  const user = getCurrentUser();
  const shopName = user.shopName || 'Liquor Ledger';

  // Monitor business date changes (only if not manually set)
  useEffect(() => {
    if (isManualDate) {
      return;
    }

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
  }, [businessDate, isManualDate]);

  const fetchDashboardData = useCallback(async () => {
    try { 
      const initResponse = await apiPost('/api/stock/initialize-today');

      if (initResponse.ok) {
        const initData = await initResponse.json();
      }

      const response = await apiGet(`/api/summary?date=${businessDate}`);
      const data = await response.json();
      
      setDashboardData({
        stockValue: data.stockValue || 0,      
        stockLiftedInvoiceValue: data.stockLiftedInvoiceValue || 0,
        stockLiftedMrpValue: data.stockLiftedMrpValue || 0,
        todaysSale: data.totalSales || 0,
        averageSales: data.averageSales || 0,
        totalMonthlySales: data.totalMonthlySales || 0,
        counterBalance: data.counterBalance || 0,
        totalAmountCollected: data.totalAmountCollected || 0,
        balanceStatus: data.balanceStatus || 'BALANCED'
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setDashboardData({
        stockValue: 0,
        stockLiftedInvoiceValue: 0,
        stockLiftedMrpValue: 0,
        todaysSale: 0,
        averageSales: 0,
        totalMonthlySales: 0,
        counterBalance: 0,
        totalAmountCollected: 0,
        balanceStatus: 'BALANCED'
      });
    }
    setLoading(false);
  }, [businessDate]);

  // Fetch shop signup date on component mount
  useEffect(() => {
    const fetchShopSignupDate = async () => {
      try {
        const response = await apiGet('/api/shop/signup-date');
        const data = await response.json();
        setShopSignupDate(data.signupDate);
      } catch (error) {
        console.error('Error fetching shop signup date:', error);
        // Fallback to current date if API fails
        setShopSignupDate(new Date().toISOString().split('T')[0]);
      }
    };
    
    fetchShopSignupDate();
  }, []);


  // Fetch data when business date changes
  useEffect(() => {
    fetchDashboardData();
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

  // Get shop signup date for validation
  const getShopSignupDate = () => {
    return shopSignupDate || new Date().toISOString().split('T')[0];
  };

  // Validate selected date
  const validateDate = (dateString) => {
    const selected = new Date(dateString);
    const currentBusinessDate = new Date(getBusinessDate());
    const signupDate = new Date(getShopSignupDate());
    
    // Can't select future business dates
    if (selected > currentBusinessDate) {
      return false;
    }
    
    // Can't select dates before signup
    if (selected < signupDate) {
      return false;
    }
    
    return true;
  };

  // Get the maximum selectable date (current business date)
  const getMaxSelectableDate = () => {
    return getBusinessDate();
  };

  // Handle date picker change
  const handleDateChange = (event) => {
    const newDate = event.target.value;
    // Automatically apply the date when selected
    if (validateDate(newDate)) {
      setIsManualDate(true);
      setBusinessDate(newDate);
    }
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
      <Navigation 
        currentPage="home"
        onNavigate={onNavigate}
        onLogout={onLogout}
        shopName={shopName}
      />
      
      <main className="dashboard-content">
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="page-title">Overview</h2>
          <div className="business-date-section" style={{ position: 'relative' }}>
            <div 
              onClick={() => {
                const dateInput = document.createElement('input');
                dateInput.type = 'date';
                dateInput.value = businessDate;
                dateInput.min = getShopSignupDate();
                dateInput.max = getMaxSelectableDate();
                dateInput.style.position = 'absolute';
                dateInput.style.left = '-9999px';
                dateInput.style.opacity = '0';
                document.body.appendChild(dateInput);
                dateInput.showPicker();
                dateInput.addEventListener('change', (e) => {
                  handleDateChange(e);
                  document.body.removeChild(dateInput);
                });
                dateInput.addEventListener('cancel', () => {
                  document.body.removeChild(dateInput);
                });
              }}
              style={{ 
                cursor: 'pointer', 
                padding: '16px 20px', 
                backgroundColor: '#F3F4F6', 
                borderRadius: '12px', 
                border: '1px solid #E5E7EB',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                textAlign: 'center',
                minWidth: '180px'
              }}
            >
              <div style={{ 
                fontSize: '12px', 
                color: '#666', 
                fontWeight: '500',
                marginBottom: '4px'
              }}>
                BUSINESS DATE:
              </div>
              <div style={{ 
                fontSize: '18px', 
                fontWeight: 'bold', 
                color: '#333'
              }}>
                {formatBusinessDate()}
              </div>
            </div>
          </div>
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
              <p className="metric-subtitle">Total cumulative values so far</p>
            </div>
          </div>
          
          <div className="metric-card">
            <div className="metric-icon green">📈</div>
            <div className="metric-info">
              <h3 className="metric-title">Sales</h3>
              <div className="dual-value">
                <div className="value-row">
                  <span className="value-label">Today:</span>
                  <span className="metric-value">{formatCurrency(dashboardData.todaysSale)}</span>
                </div>
                <div className="value-row">
                  <span className="value-label">Avg:</span>
                  <span className="metric-value">{formatCurrency(dashboardData.averageSales)}</span>
                </div>
                <div className="value-row">
                  <span className="value-label">Total:</span>
                  <span className="metric-value">{formatCurrency(dashboardData.totalMonthlySales)}</span>
                </div>
              </div>
              <p className="metric-subtitle">Sales performance metrics</p>
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

export default Home;
