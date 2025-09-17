import React, { useState, useEffect } from 'react';
import './StockReceived.css';
import useBusinessDate from './hooks/useBusinessDate';
import API_BASE_URL from './config';

function StockReceived({ onNavigate, onBack, onLogout }) {
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStore, setSelectedStore] = useState('ALL');
  const [stores, setStores] = useState(['ALL']);
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const businessDate = useBusinessDate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const shopName = user.shopName || 'Liquor Ledger';

  // Initialize selected date with business date
  useEffect(() => {
    if (businessDate && !selectedDate) {
      setSelectedDate(businessDate);
    }
  }, [businessDate, selectedDate]);

  // Fetch stock received data
  useEffect(() => {
    if (selectedDate) {
      fetchStockReceivedData();
    }
    fetchStores();
  }, [selectedDate, selectedStore]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showStoreDropdown && !event.target.closest('.store-dropdown')) {
        setShowStoreDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showStoreDropdown]);

  const fetchStores = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/stores`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const storeNames = data.map(store => {
          if (store.retailer_code !== '0000000' && store.retailer_code !== store.shop_name) {
            return `${store.shop_name} (${store.retailer_code})`;
          }
          return store.shop_name;
        });
        setStores(['ALL', ...storeNames]);
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
    }
  };

  const fetchStockReceivedData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      const url = `${API_BASE_URL}/api/stock-received?startDate=${selectedDate}&endDate=${selectedDate}&storeFilter=${selectedStore}`;
      
      console.log('🔍 Fetching stock received data...');
      console.log('URL:', url);
      console.log('Date:', selectedDate);
      console.log('Token exists:', !!token);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Failed to fetch stock received data: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('Data received:', data);
      setStockData(data.records || []);
    } catch (err) {
      console.error('Error fetching stock received data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Filter data based on search term only (backend handles store filtering)
  const filteredData = stockData.filter(record => {
    const matchesSearch = record.brandName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         record.sizeCode.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });



  if (loading) {
    return (
      <div className="stock-received-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading stock received data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stock-received-container">
      <header className="stock-received-header">
        <div className="logo-section">
          <h1 className="app-title">{shopName}</h1>
          <p className="app-subtitle">Inventory Management</p>
        </div>
        <nav className="navigation">
          <button className="nav-btn" onClick={() => onNavigate('dashboard')}>Dashboard</button>
          <button className="nav-btn" onClick={() => onNavigate('stockOnboarding')}>Stock Onboarding</button>
          <button className="nav-btn nav-btn-active" onClick={onBack}>Manage Stock</button>
          <button className="nav-btn" onClick={() => onNavigate('sheets')}>Sheets</button>
          <button className="nav-btn" onClick={() => onNavigate('reports')}>Reports</button>
          <button className="nav-btn logout-btn" onClick={onLogout}>Log Out</button>
        </nav>
      </header>

      <main className="stock-received-content">
        <div className="title-section">
          <button className="back-button" onClick={onBack}>
            ← Back to Manage Stock
          </button>
          <div className="title-content">
            <h2 className="main-title">Stock Received</h2>
            <p className="subtitle">View received stock records</p>
          </div>
          <div className="spacer"></div>
        </div>
        {error && (
          <div className="error-message">
            <p>Error: {error}</p>
            <button onClick={fetchStockReceivedData} className="retry-btn">
              Retry
            </button>
          </div>
        )}

        {!error && (
          <div className="date-picker-section">
            <div className="search-container">
              <input
                type="text"
                placeholder="Search by brand name or size code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            
            <div className="store-container">
              <div className="store-dropdown">
                <button 
                  className="store-dropdown-btn"
                  onClick={() => setShowStoreDropdown(!showStoreDropdown)}
                >
                  {selectedStore}
                  <span className="dropdown-arrow">▼</span>
                </button>
                {showStoreDropdown && (
                  <div className="store-dropdown-menu">
                    {stores.map(store => (
                      <button
                        key={store}
                        className={`store-option ${selectedStore === store ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedStore(store);
                          setShowStoreDropdown(false);
                        }}
                      >
                        {store}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="business-date-section">
              <label htmlFor="date-picker" className="date-label">Business Date:</label>
              <input
                id="date-picker"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="date-picker"
              />
              <span className="current-business-date">
                Current: {formatDate(businessDate)}
              </span>
            </div>
          </div>
        )}

        {!error && (
          <div className="stock-table-container">

            {filteredData.length === 0 ? (
              <div className="no-data">
                <div className="no-data-icon">📦</div>
                <h3>No Shop Inventory Found</h3>
                <p>No active products found in your shop inventory for {formatDate(selectedDate)}</p>
                <div className="no-data-suggestions">
                  <p>To see stock received data, you need to:</p>
                  <ul>
                    <li>Add products to your shop inventory first</li>
                    <li>Go to Stock Onboarding to add products</li>
                    <li>Or upload invoices to automatically add products</li>
                  </ul>
                </div>
                <div className="no-data-actions">
                  <button 
                    onClick={() => window.location.href = '/stockOnboarding'} 
                    className="use-current-date-btn"
                  >
                    Go to Stock Onboarding
                  </button>
                  <button 
                    onClick={() => window.location.href = '/uploadInvoice'} 
                    className="use-current-date-btn secondary"
                  >
                    Upload Invoice
                  </button>
                </div>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="stock-received-table">
                  <thead>
                    <tr>
                      <th rowSpan="2">S.No</th>
                      <th rowSpan="2">Brand Name</th>
                      <th rowSpan="2">Size Code</th>
                      <th colSpan="3">Received Stock</th>
                      <th rowSpan="2">Total Received</th>
                    </tr>
                    <tr>
                      <th>Invoice</th>
                      <th>Shift In</th>
                      <th>Shift Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((record, index) => (
                      <tr key={`${record.brandNumber}-${record.sizeCode}-${index}`}>
                        <td className="sno-cell">{index + 1}</td>
                        <td className="brand-cell">
                          <div className="brand-info">
                            <span className="brand-name">{record.brandName}</span>
                            <span className="brand-number">#{record.brandNumber}</span>
                          </div>
                        </td>
                        <td className="size-cell">
                          <span className="size-code">{record.sizeCode}</span>
                          <span className="size-ml">({record.size}ml)</span>
                        </td>
                        <td className="invoice-cell">
                          <span className={`invoice-quantity ${
                            record.invoiceQuantity > 0 ? 'positive' : 
                            record.invoiceQuantity < 0 ? 'negative' : 'zero-quantity'
                          }`}>
                            {record.invoiceQuantity}
                          </span>
                        </td>
                        <td className="shift-in-cell">
                          <span className={`shift-in-quantity ${
                            record.shiftIn > 0 ? 'positive' : 'zero-quantity'
                          }`}>
                            {record.shiftIn || 0}
                          </span>
                        </td>
                        <td className="shift-out-cell">
                          <span className={`shift-out-quantity ${
                            record.shiftOut < 0 ? 'negative' : 'zero-quantity'
                          }`}>
                            {record.shiftOut || 0}
                          </span>
                        </td>
                        <td className="total-received-cell">
                          <span className={`total-received-quantity ${
                            record.totalReceived > 0 ? 'positive' : 
                            record.totalReceived < 0 ? 'negative' : 'zero-quantity'
                          }`}>
                            {record.totalReceived}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default StockReceived;
