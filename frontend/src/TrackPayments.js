import React, { useState, useEffect } from 'react';
import './TrackPayments.css';
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

function TrackPayments({ onNavigate, onLogout }) {
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
  // Removed manual balance setting - now automatically uses previous day's closing balance

  const user = getCurrentUser();
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
    console.log(`🔄 TrackPayments: Date changed to ${selectedDate}, loading data...`);
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
      // Load payments data
      const paymentsResponse = await apiGet(`/api/payments?date=${selectedDate}`);
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

      // Load summary data (sales, income, expenses)
      const summaryResponse = await apiGet(`/api/summary?date=${selectedDate}`);
      const summary = await summaryResponse.json();
      console.log(`📊 Summary API Response for ${selectedDate}:`, {
        totalSales: summary.totalSales,
        totalOtherIncome: summary.totalOtherIncome,
        totalExpenses: summary.totalExpenses,
        counterBalance: summary.counterBalance,
        openingBalance: summary.openingBalance
      });
      setSummaryData(prev => ({
        ...prev,
        todaysSale: summary.totalSales || 0,
        totalIncome: summary.totalOtherIncome || 0,
        totalExpenses: summary.totalExpenses || 0
      }));
      
      // Always use previous day's closing balance as opening balance
      setOpeningBalance((summary.openingBalance || 0).toString());
      setOpeningBalanceSet(true); // Always set as automatic (no manual override needed)

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

  // Manual opening balance functions removed - now automatically uses previous day's closing balance

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const paymentData = {
        payment_date: selectedDate,
        cash_amount: parseFloat(payments.cash_amount) || 0,
        upi_amount: parseFloat(payments.upi_amount) || 0,
        card_amount: parseFloat(payments.card_amount) || 0
      };

      await apiPost('/api/payments', paymentData);
      setMessage('Payment record saved successfully!');
      setMessageType('success');
      setPaymentsModified(false); // Mark as saved
      loadData(); // Reload to show updated data
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
      <Navigation 
        currentPage="trackPayments"
        onNavigate={onNavigate}
        onLogout={onLogout}
        shopName={shopName}
      />

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
                <div className="balance-note">
                  <small style={{color: '#666', fontStyle: 'italic'}}>
                    Automatically set from previous day's closing balance
                  </small>
                </div>
              </div>
              
              <div className="sale-section">
                <span className="sale-label">Today's Sale:</span>
                <span className="sale-amount">{formatCurrency(summaryData.todaysSale)}</span>
              </div>
            </div>



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
                      onWheel={(e) => e.target.blur()}
                      placeholder="0.0"
                      onFocus={(e) => e.target.select()}
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
                      onWheel={(e) => e.target.blur()}
                      placeholder="0.0"
                      onFocus={(e) => e.target.select()}
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
                      onWheel={(e) => e.target.blur()}
                      placeholder="0.0"
                      onFocus={(e) => e.target.select()}
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
        {/* Manual balance dialog removed - now automatically uses previous day's closing balance */}

      </main>
    </div>
  );
}

export default TrackPayments;
