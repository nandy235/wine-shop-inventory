import React, { useState, useEffect } from 'react';
import './TrackPayments.css';
import API_BASE_URL from './config';

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

// Helper function to get current calendar date
function getCurrentCalendarDate() {
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
  
  return istTime.toLocaleDateString('en-CA');
}

function TrackPayments({ onNavigate }) {
  const [selectedDate, setSelectedDate] = useState(getBusinessDate());
  const [currentBusinessDate, setCurrentBusinessDate] = useState(getBusinessDate());
  
  const [payments, setPayments] = useState({
    cash_amount: '',
    upi_amount: '',
    card_amount: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [existingPayments, setExistingPayments] = useState([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [summaryData, setSummaryData] = useState({
    todaysSale: 0,
    totalIncome: 0,
    totalExpenses: 0,
    closingBalance: 0
  });
  const [openingBalance, setOpeningBalance] = useState('');
  const [paymentsModified, setPaymentsModified] = useState(false);
  const [openingBalanceSet, setOpeningBalanceSet] = useState(false);
  const [showBalanceDialog, setShowBalanceDialog] = useState(false);
  const [tempOpeningBalance, setTempOpeningBalance] = useState('');

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const shopName = user.shopName || 'Liquor Ledger';

  // Monitor business date changes and auto-update selected date
  useEffect(() => {
    const checkBusinessDate = () => {
      const newBusinessDate = getBusinessDate();
      if (newBusinessDate !== currentBusinessDate) {
        setCurrentBusinessDate(newBusinessDate);
        // Only auto-update if user is still on the previous business date
        if (selectedDate === currentBusinessDate) {
          setSelectedDate(newBusinessDate);
        }
      }
    };

    // Check immediately
    checkBusinessDate();
    
    // Check every minute for business date changes
    const interval = setInterval(checkBusinessDate, 60000);
    
    return () => clearInterval(interval);
  }, [currentBusinessDate, selectedDate]);

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  useEffect(() => {
    const cash = parseFloat(payments.cash_amount) || 0;
    const upi = parseFloat(payments.upi_amount) || 0;
    const card = parseFloat(payments.card_amount) || 0;
    const total = cash + upi + card;
    setTotalAmount(total);
    
    // Calculate closing counter balance
    const opening = parseFloat(openingBalance) || 0;
    const closingBalance = opening + summaryData.todaysSale + summaryData.totalIncome - summaryData.totalExpenses - total;
    setSummaryData(prev => ({ ...prev, closingBalance }));
  }, [payments, openingBalance, summaryData.todaysSale, summaryData.totalIncome, summaryData.totalExpenses]);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Load payments data
      const paymentsResponse = await fetch(`${API_BASE_URL}/api/payments?date=${selectedDate}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (paymentsResponse.ok) {
        const paymentsData = await paymentsResponse.json();
        if (paymentsData.payment) {
          setPayments({
            cash_amount: paymentsData.payment.cash_amount.toString(),
            upi_amount: paymentsData.payment.upi_amount.toString(),
            card_amount: paymentsData.payment.card_amount.toString()
          });
          setPaymentsModified(false); // Data exists, not modified
        } else {
          setPayments({
            cash_amount: '',
            upi_amount: '',
            card_amount: ''
          });
          setPaymentsModified(true); // No data exists, treat as modified to show "Save"
        }
        setExistingPayments(paymentsData.recentPayments || []);
      }

      // Load summary data (sales, income, expenses)
      const summaryResponse = await fetch(`${API_BASE_URL}/api/summary?date=${selectedDate}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (summaryResponse.ok) {
        const summary = await summaryResponse.json();
        setSummaryData(prev => ({
          ...prev,
          todaysSale: summary.totalSales || 0,
          totalIncome: summary.totalOtherIncome || 0,
          totalExpenses: summary.totalExpenses || 0
        }));
        
        // Check if opening balance was ever manually set (lifetime setting)
        const balanceKey = `openingBalance_lifetime`;
        const manuallySet = localStorage.getItem(balanceKey);
        
        if (manuallySet) {
          // Opening balance was set once for lifetime, now use previous day's closing balance
          setOpeningBalance((summary.openingBalance || 0).toString());
          setOpeningBalanceSet(true);
        } else {
          // Never been set, allow manual setting
          setOpeningBalance((summary.openingBalance || 0).toString());
          setOpeningBalanceSet(false);
        }
      }

    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    // Only allow positive numbers with up to 2 decimal places
    if (value === '' || /^\d+\.?\d{0,2}$/.test(value)) {
      setPayments(prev => ({
        ...prev,
        [name]: value
      }));
      setPaymentsModified(true);
    }
  };

  const handleOpeningBalanceClick = () => {
    if (!openingBalanceSet) {
      setTempOpeningBalance(openingBalance);
      setShowBalanceDialog(true);
    }
  };

  const handleBalanceDialogSave = () => {
    if (tempOpeningBalance && /^\d+\.?\d{0,2}$/.test(tempOpeningBalance)) {
      setOpeningBalance(tempOpeningBalance);
      // Save to localStorage as lifetime setting
      const balanceKey = `openingBalance_lifetime`;
      localStorage.setItem(balanceKey, 'true');
      setOpeningBalanceSet(true);
      setShowBalanceDialog(false);
      setMessage('Opening balance set successfully! From now on, it will use previous day closing balance.');
      setMessageType('success');
    }
  };

  const handleBalanceDialogCancel = () => {
    setTempOpeningBalance('');
    setShowBalanceDialog(false);
  };

  const handleResetOpeningBalance = () => {
    const balanceKey = `openingBalance_lifetime`;
    localStorage.removeItem(balanceKey);
    setOpeningBalanceSet(false);
    setOpeningBalance('0');
    setMessage('Opening balance reset successfully! You can now set it for the first time again.');
    setMessageType('success');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      const paymentData = {
        payment_date: selectedDate,
        cash_amount: parseFloat(payments.cash_amount) || 0,
        upi_amount: parseFloat(payments.upi_amount) || 0,
        card_amount: parseFloat(payments.card_amount) || 0
      };

      const response = await fetch(`${API_BASE_URL}/api/payments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(paymentData)
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('Payment record saved successfully!');
        setMessageType('success');
        setPaymentsModified(false); // Mark as saved
        loadData(); // Reload to show updated data
      } else {
        setMessage(data.message || 'Failed to save payment record');
        setMessageType('error');
      }
    } catch (error) {
      setMessage('Error saving payment record');
      setMessageType('error');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div className="track-payments-container">
      <header className="track-payments-header">
        <div className="track-payments-logo-section">
          <h1 className="track-payments-app-title">{shopName}</h1>
          <p className="track-payments-app-subtitle">Inventory Management</p>
        </div>
        <nav className="track-payments-navigation">
          <button className="track-payments-nav-btn" onClick={() => onNavigate('dashboard')}>Dashboard</button>
          <button className="track-payments-nav-btn" onClick={() => onNavigate('stockOnboarding')}>Stock Onboarding</button>
          <button className="track-payments-nav-btn" onClick={() => onNavigate('manageStock')}>Manage Stock</button>
          <button className="track-payments-nav-btn" onClick={() => onNavigate('sheets')}>Sheets</button>

          <button className="track-payments-nav-btn" onClick={() => onNavigate('reports')}>Reports</button>
          <button className="track-payments-nav-btn">Settings</button>
        </nav>
      </header>

      <main className="track-payments-content">
        <div className="track-payments-title-section">
          <h2 className="track-payments-main-title">Track Daily Payments</h2>
          <p className="track-payments-subtitle">Record cash, UPI, and card payments for the day</p>
        </div>

        <div className="simple-form-container">
          <form onSubmit={handleSubmit}>
            
            <div className="date-row">
              <label>DATE:</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div className="balance-sale-row">
              <div className="balance-section">
                <div className="balance-info">
                  <span className="balance-label">Opening Counter Balance:</span>
                  <span className="balance-amount">{formatCurrency(parseFloat(openingBalance) || 0)}</span>
                </div>
                <div className="balance-button-section">
                  {!openingBalanceSet && (
                    <button 
                      type="button" 
                      onClick={handleOpeningBalanceClick}
                      className="set-balance-btn"
                    >
                      SET
                    </button>
                  )}
                  {openingBalanceSet && (
                    <button 
                      type="button" 
                      onClick={handleResetOpeningBalance}
                      className="reset-balance-btn"
                      title="Reset opening balance"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
              
              <div className="sale-section">
                <span className="sale-label">Today's Sale:</span>
                <span className="sale-amount">{formatCurrency(summaryData.todaysSale)}</span>
              </div>
            </div>

            {openingBalanceSet && (
              <div className="balance-status">
                <small>Opening balance was set (lifetime). Now using previous day's closing balance.</small>
              </div>
            )}

            <table className="payments-table">
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Mode of Payment</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1.</td>
                  <td>Cash</td>
                  <td>
                    <input
                      type="text"
                      name="cash_amount"
                      value={payments.cash_amount}
                      onChange={handleInputChange}
                      placeholder="0.0"
                    />
                  </td>
                </tr>
                <tr>
                  <td>2.</td>
                  <td>UPI</td>
                  <td>
                    <input
                      type="text"
                      name="upi_amount"
                      value={payments.upi_amount}
                      onChange={handleInputChange}
                      placeholder="0.0"
                    />
                  </td>
                </tr>
                <tr>
                  <td>3.</td>
                  <td>Card</td>
                  <td>
                    <input
                      type="text"
                      name="card_amount"
                      value={payments.card_amount}
                      onChange={handleInputChange}
                      placeholder="0.0"
                    />
                  </td>
                </tr>
                <tr className="total-row">
                  <td></td>
                  <td><strong>Total Amount</strong></td>
                  <td><strong>{formatCurrency(totalAmount)}</strong></td>
                </tr>
              </tbody>
            </table>

            <div className="save-section">
              <button 
                type="submit" 
                disabled={loading || !paymentsModified}
                className={`save-btn ${!paymentsModified ? 'already-saved' : ''}`}
              >
                {loading ? 'Saving...' : !paymentsModified ? 'Already Saved ✓' : 'Save Payment Methods'}
              </button>
            </div>

            <div className="closing-balance">
              <strong>Closing Counter Balance: {formatCurrency(summaryData.closingBalance)}</strong>
            </div>

            {message && (
              <div className={`message ${messageType}`}>
                {message}
              </div>
            )}
          </form>
        </div>

        {/* Opening Balance Dialog */}
        {showBalanceDialog && (
          <div className="dialog-overlay">
            <div className="dialog-box">
              <h3>Set Opening Counter Balance</h3>
              <p className="dialog-warning">
                ⚠️ <strong>Important:</strong> Opening balance can be set only once for the lifetime of your shop. 
                After this, the system will automatically use the previous day's closing balance as opening balance. 
                You will need admin permission to manually update it later.
              </p>
              <div className="dialog-input-section">
                <label>Enter Opening Balance:</label>
                <input
                  type="text"
                  value={tempOpeningBalance}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d+\.?\d{0,2}$/.test(value)) {
                      setTempOpeningBalance(value);
                    }
                  }}
                  placeholder="0.0"
                  autoFocus
                />
              </div>
              <div className="dialog-buttons">
                <button 
                  type="button" 
                  onClick={handleBalanceDialogCancel}
                  className="dialog-btn-cancel"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={handleBalanceDialogSave}
                  className="dialog-btn-save"
                  disabled={!tempOpeningBalance}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {existingPayments.length > 0 && (
          <div className="track-payments-history-section">
            <h3 className="track-payments-history-title">Recent Payment Records</h3>
            <div className="track-payments-history-grid">
              {existingPayments.map((payment) => (
                <div key={payment.id} className="track-payments-history-card">
                  <div className="track-payments-history-date">
                    {formatDate(payment.payment_date)}
                  </div>
                  <div className="track-payments-history-amounts">
                    <div className="track-payments-history-amount">
                      <span className="track-payments-history-icon">💵</span>
                      <span>Cash: {formatCurrency(payment.cash_amount)}</span>
                    </div>
                    <div className="track-payments-history-amount">
                      <span className="track-payments-history-icon">📱</span>
                      <span>UPI: {formatCurrency(payment.upi_amount)}</span>
                    </div>
                    <div className="track-payments-history-amount">
                      <span className="track-payments-history-icon">💳</span>
                      <span>Card: {formatCurrency(payment.card_amount)}</span>
                    </div>
                  </div>
                  <div className="track-payments-history-total">
                    Total: {formatCurrency(payment.total_amount)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default TrackPayments;
