import React, { useState, useEffect, useRef, useMemo, useCallback, useReducer } from 'react';
import './IndentEstimate.css';
import API_BASE_URL from './config';

// Constants
const SEARCH_DEBOUNCE_DELAY = 150;
const MIN_SEARCH_LENGTH = 1;
const TAX_RATES = {
  TCS_RATE: 0.01,
  RETAIL_EXCISE_RATE: 0.10,
};
const DEFAULT_PACK_QUANTITY = 12;

// State management using reducer
const initialState = {
  searchTerm: '',
  searchResults: [],
  selectedItems: [],
  loading: false,
  showResults: false,
  showEstimate: false,
  tenTimesCompleted: false,
  notification: null,
  searchCache: new Map(),
};

const actionTypes = {
  SET_SEARCH_TERM: 'SET_SEARCH_TERM',
  SET_SEARCH_RESULTS: 'SET_SEARCH_RESULTS',
  SET_LOADING: 'SET_LOADING',
  SET_SHOW_RESULTS: 'SET_SHOW_RESULTS',
  SET_SHOW_ESTIMATE: 'SET_SHOW_ESTIMATE',
  SET_TEN_TIMES_COMPLETED: 'SET_TEN_TIMES_COMPLETED',
  ADD_ITEM: 'ADD_ITEM',
  UPDATE_ITEM_QUANTITY: 'UPDATE_ITEM_QUANTITY',
  REMOVE_ITEM: 'REMOVE_ITEM',
  SET_NOTIFICATION: 'SET_NOTIFICATION',
  CLEAR_NOTIFICATION: 'CLEAR_NOTIFICATION',
  CACHE_SEARCH_RESULT: 'CACHE_SEARCH_RESULT',
};

function stateReducer(state, action) {
  switch (action.type) {
    case actionTypes.SET_SEARCH_TERM:
      return { ...state, searchTerm: action.payload };
    case actionTypes.SET_SEARCH_RESULTS:
      return { ...state, searchResults: action.payload };
    case actionTypes.SET_LOADING:
      return { ...state, loading: action.payload };
    case actionTypes.SET_SHOW_RESULTS:
      return { ...state, showResults: action.payload };
    case actionTypes.SET_SHOW_ESTIMATE:
      return { ...state, showEstimate: action.payload };
    case actionTypes.SET_TEN_TIMES_COMPLETED:
      return { ...state, tenTimesCompleted: action.payload };
    case actionTypes.ADD_ITEM:
      return { ...state, selectedItems: [...state.selectedItems, action.payload] };
    case actionTypes.UPDATE_ITEM_QUANTITY:
      return {
        ...state,
        selectedItems: state.selectedItems.map(item =>
          item.id === action.payload.id
            ? { ...item, ...action.payload.updates }
            : item
        )
      };
    case actionTypes.REMOVE_ITEM:
      return {
        ...state,
        selectedItems: state.selectedItems.filter(item => item.id !== action.payload)
      };
    case actionTypes.SET_NOTIFICATION:
      return { ...state, notification: action.payload };
    case actionTypes.CLEAR_NOTIFICATION:
      return { ...state, notification: null };
    case actionTypes.CACHE_SEARCH_RESULT:
      const newCache = new Map(state.searchCache);
      newCache.set(action.payload.term, action.payload.results);
      return { ...state, searchCache: newCache };
    default:
      return state;
  }
}

function IndentEstimate({ onNavigate, onBack }) {
  const [state, dispatch] = useReducer(stateReducer, initialState);
  const searchContainerRef = useRef(null);
  const summaryRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  const notificationTimeoutRef = useRef(null);
  const [summaryPulse, setSummaryPulse] = useState(false);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const shopName = user.shopName || 'Liquor Ledger';

  // Utility functions
  const calculateTotalBottles = useCallback((cases = 0, bottles = 0, packQuantity = DEFAULT_PACK_QUANTITY) => {
    return (cases * packQuantity) + bottles;
  }, []);

  const calculateItemAmount = useCallback((cases = 0, bottles = 0, invoicePrice = 0, packQuantity = DEFAULT_PACK_QUANTITY) => {
    const totalBottles = calculateTotalBottles(cases, bottles, packQuantity);
    return totalBottles * invoicePrice;
  }, [calculateTotalBottles]);

  const validateQuantity = useCallback((value, min = 0, max = 9999) => {
    const numValue = parseInt(value) || 0;
    return Math.max(min, Math.min(max, numValue));
  }, []);

  const showNotification = useCallback((message, type = 'info') => {
    dispatch({ type: actionTypes.SET_NOTIFICATION, payload: { message, type } });
    
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }
    
    notificationTimeoutRef.current = setTimeout(() => {
      dispatch({ type: actionTypes.CLEAR_NOTIFICATION });
    }, 3000);
  }, []);

  const createItemFromBrand = useCallback((brand) => {
    const invoicePrice = parseFloat(brand.invoice) || 0;
    const packQuantity = brand.pack_quantity || DEFAULT_PACK_QUANTITY;
    const cases = 1;
    const bottles = 0;
    
    return {
      id: brand.id,
      brandName: brand.brand_name,
      brandNumber: brand.brand_number,
      size: `${packQuantity}/${brand.size_ml}ml`,
      sizeCode: brand.size_code,
      cases,
      bottles,
      packQuantity,
      invoicePrice,
      specialMargin: parseFloat(brand.special_margin) || 0,
      specialExciseCess: parseFloat(brand.special_excise_cess) || 0,
      amount: calculateItemAmount(cases, bottles, invoicePrice, packQuantity)
    };
  }, [calculateItemAmount]);

  const handleSearch = useCallback(async (term) => {
    const searchQuery = (term || state.searchTerm).trim();
    
    if (!searchQuery || searchQuery.length < MIN_SEARCH_LENGTH) {
      dispatch({ type: actionTypes.SET_SEARCH_RESULTS, payload: [] });
      dispatch({ type: actionTypes.SET_SHOW_RESULTS, payload: false });
      return;
    }

    // Check cache first
    if (state.searchCache.has(searchQuery)) {
      const cachedResults = state.searchCache.get(searchQuery);
      dispatch({ type: actionTypes.SET_SEARCH_RESULTS, payload: cachedResults });
      dispatch({ type: actionTypes.SET_SHOW_RESULTS, payload: true });
      return;
    }
    
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    dispatch({ type: actionTypes.SET_LOADING, payload: true });
    
    try {
      const token = localStorage.getItem('token');
      const url = `${API_BASE_URL}/api/search-brands?q=${encodeURIComponent(searchQuery)}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        signal: abortControllerRef.current.signal
      });

      if (response.ok) {
        const data = await response.json();
        // Support both shapes: { brands: [...] } or [...]
        const results = Array.isArray(data) ? data : (data.brands || []);
        
        dispatch({ type: actionTypes.SET_SEARCH_RESULTS, payload: results });
        dispatch({ type: actionTypes.SET_SHOW_RESULTS, payload: true });
        dispatch({ type: actionTypes.CACHE_SEARCH_RESULT, payload: { term: searchQuery, results } });
      } else {
        const errorText = await response.text().catch(() => '');
        console.error('IndentEstimate: search failed', { status: response.status, errorText });
        throw new Error(`Search failed (${response.status})`);
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Search error:', error);
        showNotification('Failed to search products. Please try again.', 'error');
        dispatch({ type: actionTypes.SET_SEARCH_RESULTS, payload: [] });
        dispatch({ type: actionTypes.SET_SHOW_RESULTS, payload: false });
      }
    } finally {
      dispatch({ type: actionTypes.SET_LOADING, payload: false });
    }
  }, [state.searchTerm, state.searchCache, showNotification]);

  const handleInputChange = useCallback((e) => {
    const value = e.target.value.slice(0, 100); // Limit input length
    dispatch({ type: actionTypes.SET_SEARCH_TERM, payload: value });
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Set new timeout for real-time search
    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(value);
    }, SEARCH_DEBOUNCE_DELAY);
  }, [handleSearch]);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      handleSearch();
    } else if (e.key === 'Escape') {
      dispatch({ type: actionTypes.SET_SHOW_RESULTS, payload: false });
      dispatch({ type: actionTypes.SET_SEARCH_TERM, payload: '' });
    }
  }, [handleSearch]);

  // Handle click outside to close results and cleanup
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        dispatch({ type: actionTypes.SET_SHOW_RESULTS, payload: false });
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      // Cleanup all timeouts and listeners
      document.removeEventListener('mousedown', handleClickOutside);
      
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
      
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const addToEstimate = useCallback((brand) => {
    const existingItem = state.selectedItems.find(item => item.id === brand.id);
    if (existingItem) {
      return;
    }

    const newItem = createItemFromBrand(brand);
    dispatch({ type: actionTypes.ADD_ITEM, payload: newItem });
    // Keep search open and term intact so user can add multiple items quickly
  }, [state.selectedItems, createItemFromBrand, showNotification]);

  const updateQuantity = useCallback((id, field, value) => {
    const item = state.selectedItems.find(item => item.id === id);
    if (!item) return;
    
    let validatedValue;
    if (field === 'cases') {
      validatedValue = validateQuantity(value, 0, 9999);
    } else if (field === 'bottles') {
      validatedValue = validateQuantity(value, 0, item.packQuantity - 1);
    } else {
      return;
    }
    
    const updates = { [field]: validatedValue };
    
    // Recalculate amount
    const newCases = field === 'cases' ? validatedValue : item.cases;
    const newBottles = field === 'bottles' ? validatedValue : item.bottles;
    updates.amount = calculateItemAmount(newCases, newBottles, item.invoicePrice, item.packQuantity);
    
    dispatch({ type: actionTypes.UPDATE_ITEM_QUANTITY, payload: { id, updates } });
  }, [state.selectedItems, validateQuantity, calculateItemAmount]);

  const removeItem = useCallback((id) => {
    dispatch({ type: actionTypes.REMOVE_ITEM, payload: id });
    showNotification('Item removed from estimate', 'info');
  }, [showNotification]);

  const handleShowEstimate = useCallback(() => {
    dispatch({ type: actionTypes.SET_SHOW_ESTIMATE, payload: true });
    showNotification('Estimate summary generated', 'success');
    // Scroll and highlight
    requestAnimationFrame(() => {
      if (summaryRef.current) {
        summaryRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setSummaryPulse(true);
        setTimeout(() => setSummaryPulse(false), 1500);
      }
    });
  }, [showNotification]);

  // Memoized calculations
  const totalBottles = useMemo(() => {
    return state.selectedItems.reduce((total, item) => {
      return total + calculateTotalBottles(item.cases, item.bottles, item.packQuantity);
    }, 0);
  }, [state.selectedItems, calculateTotalBottles]);

  const estimate = useMemo(() => {
    const invoiceValue = state.selectedItems.reduce((total, item) => total + (item.amount || 0), 0);
    
    const mrpRoundingOff = state.selectedItems.reduce((total, item) => {
      const itemTotalBottles = calculateTotalBottles(item.cases, item.bottles, item.packQuantity);
      return total + (itemTotalBottles * (item.specialMargin || 0));
    }, 0);
    
    const netInvoiceValue = invoiceValue + mrpRoundingOff;
    const retailExciseTurnoverTax = state.tenTimesCompleted ? invoiceValue * TAX_RATES.RETAIL_EXCISE_RATE : 0;
    
    const specialExciseCess = state.selectedItems.reduce((total, item) => {
      const itemTotalBottles = calculateTotalBottles(item.cases, item.bottles, item.packQuantity);
      return total + (itemTotalBottles * (item.specialExciseCess || 0));
    }, 0);
    
    // TCS = 1% of (Invoice + MRP Rounding Off + Retail Excise Turnover Tax)
    const tcsBase = netInvoiceValue + retailExciseTurnoverTax;
    const tcs = tcsBase * TAX_RATES.TCS_RATE;
    const grandTotal = netInvoiceValue + retailExciseTurnoverTax + specialExciseCess + tcs;

    return {
      invoiceValue,
      mrpRoundingOff,
      netInvoiceValue,
      retailExciseTurnoverTax,
      specialExciseCess,
      tcs,
      grandTotal
    };
  }, [state.selectedItems, state.tenTimesCompleted, calculateTotalBottles]);

  // Utility function to format numbers with Indian comma system
  const formatIndianCurrency = useCallback((amount) => {
    const num = parseFloat(amount || 0);
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  }, []);

  // Simple currency formatter for PDF (jsPDF compatible)
  const formatCurrencyForPDF = useCallback((amount) => {
    const num = parseFloat(amount || 0);
    const formatted = num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `₹${formatted}`;
  }, []);

  // Clean PDF generation utility function - Print-to-PDF HTML approach
  const generatePDF = useCallback((items, totalAmount, estimateData = null) => {
    if (!items || items.length === 0) {
      showNotification('Please add items to the estimate before generating PDF', 'warning');
      return;
    }

    const formatINR = (amount) => {
      const num = parseFloat(amount || 0);
      return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const rowsHtml = items.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${item.brandName}</td>
        <td>${item.size}</td>
        <td>${item.cases}</td>
        <td>${item.bottles}</td>
        <td>${formatINR(item.invoicePrice || 0)}</td>
        <td class="text-right">${formatINR(item.amount || 0)}</td>
      </tr>
    `).join('');

    const summaryHtml = estimateData ? `
      <h3 style="margin-top: 24px; text-align: center;">Estimate Summary</h3>
      <table style="width:100%; border-collapse: collapse;">
        <tbody>
          <tr><td style="padding:8px; border:1px solid #ddd;">Invoice Value:</td><td style="padding:8px; border:1px solid #ddd; text-align:right;">${formatINR(estimateData.invoiceValue)}</td></tr>
          <tr><td style="padding:8px; border:1px solid #ddd;">MRP Rounding Off:</td><td style="padding:8px; border:1px solid #ddd; text-align:right;">${formatINR(estimateData.mrpRoundingOff)}</td></tr>
          <tr><td style="padding:8px; border:1px solid #ddd;">Net Invoice Value:</td><td style="padding:8px; border:1px solid #ddd; text-align:right; font-weight:700;">${formatINR(estimateData.netInvoiceValue)}</td></tr>
          <tr><td style="padding:8px; border:1px solid #ddd;">Retail Excise Turnover Tax:</td><td style="padding:8px; border:1px solid #ddd; text-align:right;">${formatINR(estimateData.retailExciseTurnoverTax)}</td></tr>
          <tr><td style="padding:8px; border:1px solid #ddd;">Special Excise Cess:</td><td style="padding:8px; border:1px solid #ddd; text-align:right;">${formatINR(estimateData.specialExciseCess)}</td></tr>
          <tr><td style="padding:8px; border:1px solid #ddd;">TCS:</td><td style="padding:8px; border:1px solid #ddd; text-align:right;">${formatINR(estimateData.tcs)}</td></tr>
          <tr><td style="padding:8px; border:1px solid #ddd;">Grand Total:</td><td style="padding:8px; border:1px solid #ddd; text-align:right; font-weight:700;">${formatINR(estimateData.grandTotal)}</td></tr>
        </tbody>
      </table>
    ` : '';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Indent Estimate</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .company-name { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
          .document-title { font-size: 18px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f5f5f5; font-weight: bold; }
          .text-right { text-align: right; }
          .total-row { background-color: #f0f0f0; font-weight: bold; }
          .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">${shopName}</div>
          <div class="document-title">Indent Estimate</div>
          <div style="margin-top: 10px; color: #666;">Generated on: ${new Date().toLocaleDateString('en-IN')}</div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>S.No</th>
              <th>Brand Name</th>
              <th>Size</th>
              <th>Cases</th>
              <th>Bottles</th>
              <th>Invoice Price/Bottle</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="total-row">
              <td colspan="6" class="text-right">Invoice Value:</td>
              <td class="text-right">${formatINR(totalAmount)}</td>
            </tr>
          </tbody>
        </table>

        ${summaryHtml}
        
        <div class="footer">
          <p>This is computer generated estimate, actuals may slightly vary.</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
        setTimeout(() => {
          printWindow.close();
        }, 1000);
      };
      showNotification('Print dialog opened. Save as PDF to download.', 'info');
    } else {
      showNotification('Please allow popups to generate PDF', 'warning');
    }
  }, [showNotification, shopName]);

  // Wrapper function to maintain compatibility
  const handleGeneratePDF = useCallback(() => {
    const estimateData = state.showEstimate ? estimate : null;
    generatePDF(state.selectedItems, estimate.invoiceValue, estimateData);
  }, [generatePDF, state.selectedItems, state.showEstimate, estimate]);

  // Notification component
  const NotificationToast = ({ notification, onClose }) => {
    if (!notification) return null;
    
    const { message, type } = notification;
    const typeClass = {
      success: 'notification-success',
      error: 'notification-error',
      warning: 'notification-warning',
      info: 'notification-info'
    }[type] || 'notification-info';
    
    return (
      <div className={`notification-toast ${typeClass}`} onClick={onClose}>
        <span className="notification-message">{message}</span>
        <button className="notification-close" onClick={onClose}>×</button>
      </div>
    );
  };

  return (
    <div className="indent-estimate-container">
      {/* Notification Toast */}
      <NotificationToast 
        notification={state.notification} 
        onClose={() => dispatch({ type: actionTypes.CLEAR_NOTIFICATION })} 
      />
      
      <header className="indent-estimate-header">
        <div className="indent-estimate-logo-section">
          <h1 className="indent-estimate-app-title">{shopName}</h1>
          <p className="indent-estimate-app-subtitle">Inventory Management</p>
        </div>
        <nav className="indent-estimate-navigation">
          <button className="indent-estimate-nav-btn" onClick={() => onNavigate('dashboard')}>Dashboard</button>
          <button className="indent-estimate-nav-btn" onClick={() => onNavigate('stockOnboarding')}>Stock Onboarding</button>
          <button className="indent-estimate-nav-btn indent-estimate-nav-btn-active" onClick={onBack}>Manage Stock</button>
          <button className="indent-estimate-nav-btn" onClick={() => onNavigate('sheets')}>Sheets</button>
          <button className="indent-estimate-nav-btn" onClick={() => onNavigate('reports')}>Reports</button>
          <button className="indent-estimate-nav-btn">Settings</button>
        </nav>
      </header>

      <main className="indent-estimate-content">
        <div className="indent-estimate-title-section">
          <div className="back-button-container">
            <button className="back-button" onClick={onBack}>
              ← Back to Manage Stock
            </button>
          </div>
          <h2 className="indent-estimate-main-title">Indent Estimate</h2>
        </div>

        {/* Product Search Section */}
        <div className="search-section" ref={searchContainerRef}>
          <div className="search-header">
            <span className="indent-search-icon">🔍</span>
            <h3>Product Search</h3>
          </div>
          <div className="search-input-group">
            <input
              type="text"
              className="search-input"
              placeholder="Search by brand number or brand name..."
              value={state.searchTerm}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              onFocus={() => {
                if (state.searchResults.length > 0 && state.searchTerm.length >= MIN_SEARCH_LENGTH) {
                  dispatch({ type: actionTypes.SET_SHOW_RESULTS, payload: true });
                }
              }}
              aria-label="Search products"
              aria-expanded={state.showResults}
              aria-autocomplete="list"
            />
            <button 
              className="search-button"
              onClick={() => handleSearch()}
              disabled={state.loading}
              aria-label="Search products"
            >
              {state.loading ? (
                <>
                  <span className="loading-spinner-small">⟳</span>
                  Searching...
                </>
              ) : (
                'Search'
              )}
            </button>
          </div>

          {/* Search Results */}
          {state.showResults && (
            <div className="search-results" role="listbox" aria-label="Search results">
              {state.loading ? (
                <div className="loading-results" role="status" aria-live="polite">
                  <div className="loading-spinner">🔄</div>
                  <span>Searching...</span>
                </div>
              ) : state.searchResults.length > 0 ? (
                <div className="results-list">
                  {state.searchResults.map((brand, index) => (
                    <div 
                      key={brand.id} 
                      className="result-item" 
                      onClick={() => addToEstimate(brand)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          addToEstimate(brand);
                        }
                      }}
                      tabIndex={0}
                      role="option"
                      aria-selected={false}
                    >
                      <div className="result-info">
                        <span className="brand-number">{brand.brand_number}</span>
                        <span className="brand-name">{brand.brand_name}</span>
                        <span className="pack-type">{brand.pack_type || 'G'}</span>
                        <span className="brand-size">{brand.pack_quantity || DEFAULT_PACK_QUANTITY}/{brand.size_ml}ml</span>
                      </div>
                      <button 
                        className="add-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          addToEstimate(brand);
                        }}
                        aria-label={`Add ${brand.brand_name} to estimate`}
                        disabled={state.selectedItems.some(item => item.id === brand.id)}
                      >
                        {state.selectedItems.some(item => item.id === brand.id) ? 'Added' : 'Add'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : state.searchTerm.length >= MIN_SEARCH_LENGTH ? (
                <div className="no-results" role="status">No products found for "{state.searchTerm}"</div>
              ) : (
                <div className="no-results" role="status">Type at least {MIN_SEARCH_LENGTH} characters to search</div>
              )}
            </div>
          )}
        </div>

        {/* Estimation Section */}
        <div className="estimation-section">
          <div className="estimation-header">
            <h3>Estimation</h3>
          </div>

          {state.selectedItems.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📄</div>
              <div className="empty-text">
                <p>No items added to estimate.</p>
                <p>Use the search above to add products.</p>
              </div>
            </div>
          ) : (
            <div className="estimation-table-container">
              <table className="estimation-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Brand Name</th>
                    <th>Size</th>
                    <th>Cases</th>
                    <th>Bottles</th>
                    <th>Invoice Price</th>
                    <th>Amount</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {state.selectedItems.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1}</td>
                      <td>{item.brandName}</td>
                      <td>{item.size}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="9999"
                          step="1"
                          value={item.cases === 0 ? '' : item.cases}
                          onChange={(e) => updateQuantity(item.id, 'cases', e.target.value)}
                          onWheel={(e) => e.currentTarget.blur()}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                              e.preventDefault();
                            }
                          }}
                          onBlur={(e) => {
                            const value = validateQuantity(e.target.value, 0, 9999);
                            if (value !== item.cases) {
                              updateQuantity(item.id, 'cases', value);
                            }
                          }}
                          className="quantity-input"
                          placeholder="0"
                          onFocus={(e) => e.target.select()}
                          aria-label={`Cases for ${item.brandName}`}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max={item.packQuantity - 1}
                          step="1"
                          value={item.bottles === 0 ? '' : item.bottles}
                          onChange={(e) => updateQuantity(item.id, 'bottles', e.target.value)}
                          onWheel={(e) => e.currentTarget.blur()}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                              e.preventDefault();
                            }
                          }}
                          onBlur={(e) => {
                            const value = validateQuantity(e.target.value, 0, item.packQuantity - 1);
                            if (value !== item.bottles) {
                              updateQuantity(item.id, 'bottles', value);
                            }
                          }}
                          className="quantity-input"
                          placeholder="0"
                          onFocus={(e) => e.target.select()}
                          aria-label={`Bottles for ${item.brandName}`}
                        />
                      </td>
                      <td>{formatIndianCurrency(item.invoicePrice || 0)}</td>
                      <td>{formatIndianCurrency(item.amount || 0)}</td>
                      <td>
                        <button 
                          className="remove-button"
                          onClick={() => removeItem(item.id)}
                          aria-label={`Remove ${item.brandName} from estimate`}
                          title="Remove item"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>


              <div className="action-buttons">
                <button 
                  className="get-estimate-button" 
                  onClick={handleShowEstimate}
                  disabled={state.selectedItems.length === 0}
                  aria-label="Calculate estimate summary"
                >
                  📊 Get Estimate
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Estimate Summary Section */}
        {state.showEstimate && state.selectedItems.length > 0 && (
          <div ref={summaryRef} className={`estimate-summary-section ${summaryPulse ? 'summary-pulse' : ''}`}>
            <div className="estimate-summary-header">
              <h3>Estimate Summary</h3>
            </div>
            
            <div className="ten-times-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={state.tenTimesCompleted}
                  onChange={(e) => dispatch({ type: actionTypes.SET_TEN_TIMES_COMPLETED, payload: e.target.checked })}
                />
                10 Times Stock Lifted Completed (10% Retail Excise Turnover Tax)
              </label>
            </div>

            <div className="estimate-calculations">
              <div className="calculation-table">
                  <div className="calculation-table">
                    <div className="calculation-row">
                      <span className="calculation-label">Invoice Value:</span>
                      <span className="calculation-value">{formatIndianCurrency(estimate.invoiceValue)}</span>
                    </div>
                    <div className="calculation-row">
                      <span className="calculation-label">MRP Rounding Off:</span>
                      <span className="calculation-value">{formatIndianCurrency(estimate.mrpRoundingOff)}</span>
                    </div>
                    <div className="calculation-row total-row">
                      <span className="calculation-label">Net Invoice Value:</span>
                      <span className="calculation-value">{formatIndianCurrency(estimate.netInvoiceValue)}</span>
                    </div>
                    <div className="calculation-row">
                      <span className="calculation-label">Retail Excise Turnover Tax:</span>
                      <span className="calculation-value">{formatIndianCurrency(estimate.retailExciseTurnoverTax)}</span>
                    </div>
                    <div className="calculation-row">
                      <span className="calculation-label">Special Excise Cess:</span>
                      <span className="calculation-value">{formatIndianCurrency(estimate.specialExciseCess)}</span>
                    </div>
                    <div className="calculation-row">
                      <span className="calculation-label">TCS :</span>
                      <span className="calculation-value">{formatIndianCurrency(estimate.tcs)}</span>
                    </div>
                    <div className="calculation-row grand-total-row">
                      <span className="calculation-label">Grand Total:</span>
                      <span className="calculation-value">{formatIndianCurrency(estimate.grandTotal)}</span>
                    </div>
                  </div>
              </div>
            </div>

            <div className="pdf-action-buttons">
              <button 
                className="download-pdf-button" 
                onClick={handleGeneratePDF}
                disabled={state.loading}
                aria-label="Download estimate as PDF"
              >
                {state.loading ? (
                  <>
                    <span className="loading-spinner-small">⟳</span>
                    Generating PDF...
                  </>
                ) : (
                  <>
                    📄 Download Indent Estimate (PDF)
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default IndentEstimate;