import React, { useState, useEffect, useReducer, useMemo, useCallback } from 'react';
import './DownloadSaleSheet.css';
import API_BASE_URL from './config';

// Constants
const BUSINESS_CONFIG = {
  START_HOUR: 11,
  START_MINUTE: 30,
  TABLE_SPLIT_THRESHOLD: 50,
  IST_OFFSET: 5.5 * 60 * 60 * 1000
};

const FETCH_STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error'
};

// Helper function to calculate business date
const calculateBusinessDate = () => {
  const now = new Date();
  
  // Always get IST time using toLocaleString with Asia/Kolkata timezone
  // This works regardless of server timezone (UTC, IST, or any other)
  const istTimeString = now.toLocaleString('en-CA', { 
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse the IST time string to get a proper Date object
  const istTime = new Date(istTimeString);
  
  const isBeforeBusinessStart = 
    istTime.getHours() < BUSINESS_CONFIG.START_HOUR || 
    (istTime.getHours() === BUSINESS_CONFIG.START_HOUR && istTime.getMinutes() < BUSINESS_CONFIG.START_MINUTE);
  
  let businessDate;
  if (isBeforeBusinessStart) {
    // Before 11:30 AM IST - use previous day
    const yesterday = new Date(istTime);
    yesterday.setDate(yesterday.getDate() - 1);
    businessDate = yesterday.toLocaleDateString('en-CA');
  } else {
    // After 11:30 AM IST - use current day
    businessDate = istTime.toLocaleDateString('en-CA');
  }
  
  
  return businessDate;
};

// Custom hook for business date
const useBusinessDate = () => {
  const [businessDate, setBusinessDate] = useState(calculateBusinessDate);

  // Update business date every minute to handle the 11:30 AM transition
  useEffect(() => {
    const interval = setInterval(() => {
      const newBusinessDate = calculateBusinessDate();
      setBusinessDate(newBusinessDate);
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  return businessDate;
};

// Helper function for backward compatibility
function getBusinessDate() {
  return calculateBusinessDate();
}

// State reducer for better state management
const initialState = {
  stockData: [],
  summaryData: null,
  incomeData: [],
  expensesData: [],
  paymentsData: null,
  closingStockStatus: null,
  fetchState: FETCH_STATES.IDLE,
  error: null,
  generating: false
};

const dataReducer = (state, action) => {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, fetchState: FETCH_STATES.LOADING, error: null };
    case 'FETCH_SUCCESS':
      return { 
        ...state, 
        fetchState: FETCH_STATES.SUCCESS,
        ...action.payload 
      };
    case 'FETCH_ERROR':
      return { 
        ...state, 
        fetchState: FETCH_STATES.ERROR, 
        error: action.payload 
      };
    case 'SET_GENERATING':
      return { ...state, generating: action.payload };
    case 'UPDATE_DATA':
      return { ...state, ...action.payload };
    case 'SET_STOCK_DATA':
      return { ...state, stockData: action.payload };
    case 'SET_SUMMARY_DATA':
      return { ...state, summaryData: action.payload };
    case 'SET_INCOME_DATA':
      return { ...state, incomeData: action.payload };
    case 'SET_EXPENSES_DATA':
      return { ...state, expensesData: action.payload };
    case 'SET_PAYMENTS_DATA':
      return { ...state, paymentsData: action.payload };
    case 'SET_CLOSING_STOCK_STATUS':
      return { ...state, closingStockStatus: action.payload };
    default:
      return state;
  }
};

// API service
const createApiService = (token) => ({
  async fetchWithAuth(url) {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }
});

// Error Display Component
const ErrorDisplay = ({ error, onRetry }) => (
  <div style={{ 
    padding: '20px', 
    border: '2px solid #ff6b6b', 
    borderRadius: '8px', 
    backgroundColor: '#ffe0e0',
    margin: '20px 0' 
  }}>
    <h3 style={{ color: '#d63384', margin: '0 0 10px 0' }}>⚠️ Error Loading Data</h3>
    <p style={{ margin: '0 0 15px 0', color: '#721c24' }}>
      {error?.message || 'An unexpected error occurred while loading the sale sheet data.'}
    </p>
    <button 
      onClick={onRetry}
      style={{
        backgroundColor: '#dc3545',
        color: 'white',
        border: 'none',
        padding: '8px 16px',
        borderRadius: '4px',
        cursor: 'pointer'
      }}
    >
      Retry Loading
    </button>
  </div>
);

// Loading Component
const LoadingDisplay = () => (
  <div style={{ 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: '40px',
    gap: '10px' 
  }}>
    <div style={{
      width: '20px',
      height: '20px',
      border: '2px solid #007bff',
      borderTop: '2px solid transparent',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }}></div>
    <span>Loading sale sheet data...</span>
    <style>
      {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
    </style>
  </div>
);

function DownloadSaleSheet({ onNavigate }) {
  // Use business date hook
  const businessDate = useBusinessDate();
  
  // Date state (keeping separate for form controls)
  const [dateMode, setDateMode] = useState('single');
  const [selectedDate, setSelectedDate] = useState(businessDate);
  const [startDate, setStartDate] = useState(businessDate);
  const [endDate, setEndDate] = useState(businessDate);

  // Update form dates when business date changes
  useEffect(() => {
    setSelectedDate(businessDate);
    setStartDate(businessDate);
    setEndDate(businessDate);
  }, [businessDate]);
  
  // Main state with reducer
  const [state, dispatch] = useReducer(dataReducer, initialState);

  // Memoized user data and token
  const userData = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
  const token = useMemo(() => localStorage.getItem('token'), []);
  const shopName = useMemo(() => userData.shopName || 'Liquor Ledger', [userData.shopName]);
  
  // Memoized API service
  const apiService = useMemo(() => createApiService(token), [token]);
  
  // Memoized calculations
  const calculations = useMemo(() => {
    const totalSales = state.stockData.reduce((sum, item) => sum + (item.salesValue || 0), 0);
    const totalProducts = state.stockData.length;
    const showBothFormats = totalProducts > BUSINESS_CONFIG.TABLE_SPLIT_THRESHOLD;
    
    return { totalSales, totalProducts, showBothFormats };
  }, [state.stockData]);

  // Memoized utility functions
  const getCurrentDate = useCallback(() => {
    return dateMode === 'single' ? selectedDate : endDate;
  }, [dateMode, selectedDate, endDate]);

  const getDateRange = useCallback(() => {
    return dateMode === 'single' ? selectedDate : `${startDate} to ${endDate}`;
  }, [dateMode, selectedDate, startDate, endDate]);

  // Individual fetch functions
  const fetchStockData = useCallback(async () => {
    try {
      if (dateMode === 'single') {
        // Single date logic
        const response = await fetch(`${API_BASE_URL}/api/shop/products?date=${selectedDate}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const result = await response.json();
          const products = result.products || [];
          
          console.log('📊 Received products from API:', products.length);
          if (products.length > 0) {
            console.log('📋 Sample product from API:', products[0]);
          }
          
          const salesData = products.map((item, index) => {
            const openingStock = item.openingStock || 0;
            // Handle both receivedStock and totalReceivedToday from backend
            const receivedStock = item.receivedStock || item.totalReceivedToday || 0;
            const totalStock = item.totalStock || (openingStock + receivedStock);
            const closingStock = item.closingStock !== null ? item.closingStock : totalStock;
            const sales = Math.max(0, totalStock - closingStock);
            
            console.log(`Product ${item.brandName}: opening=${openingStock}, received=${receivedStock}, total=${totalStock}, closing=${closingStock}, sales=${sales}`);
            
            return {
              serialNo: index + 1,
              brandNumber: item.brandNumber,
              brandName: item.name,
              sizeCode: item.sizeCode,
              openingStock,
              receivedStock,
              totalStock,
              closingStock,
              sales,
              price: item.finalPrice || 0,
              salesValue: sales * (item.finalPrice || 0),
              productType: item.product_type || item.category || 'IML'
            };
          });

          dispatch({ type: 'SET_STOCK_DATA', payload: salesData });
        }
      } else {
        // Date range logic: opening from start date, closing from end date
        const [startResponse, endResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/shop/products?date=${startDate}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
          }),
          fetch(`${API_BASE_URL}/api/shop/products?date=${endDate}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
          })
        ]);

        if (startResponse.ok && endResponse.ok) {
          const startResult = await startResponse.json();
          const endResult = await endResponse.json();
          
          const startProducts = startResult.products || [];
          const endProducts = endResult.products || [];

          // Create a map of end products by brand + size for lookup
          const endProductsMap = new Map();
          endProducts.forEach(product => {
            const key = `${product.brandNumber}_${product.sizeCode}`;
            endProductsMap.set(key, product);
          });

          const salesData = startProducts.map((startItem, index) => {
            const key = `${startItem.brandNumber}_${startItem.sizeCode}`;
            const endItem = endProductsMap.get(key);
            
            const openingStock = startItem.openingStock || 0;
            // Handle both receivedStock and totalReceivedToday from backend
            const receivedStock = startItem.receivedStock || startItem.totalReceivedToday || 0;
            const totalStock = startItem.totalStock || (openingStock + receivedStock);
            const closingStock = endItem ? (endItem.closingStock !== null ? endItem.closingStock : endItem.totalStock) : totalStock;
            const sales = Math.max(0, totalStock - closingStock);
            
            console.log(`Range Product ${startItem.brandName}: opening=${openingStock}, received=${receivedStock}, total=${totalStock}, closing=${closingStock}, sales=${sales}`);
            
            return {
              serialNo: index + 1,
              brandNumber: startItem.brandNumber,
              brandName: startItem.name,
              sizeCode: startItem.sizeCode,
              openingStock,
              receivedStock,
              totalStock,
              closingStock,
              sales,
              price: startItem.finalPrice || 0,
              salesValue: sales * (startItem.finalPrice || 0),
              productType: startItem.product_type || startItem.category || 'IML'
            };
          });

          dispatch({ type: 'SET_STOCK_DATA', payload: salesData });
        }
      }
    } catch (error) {
      console.error('Error fetching stock data:', error);
    }
  }, [dateMode, selectedDate, startDate, endDate, token]);

  const fetchSummaryData = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/summary`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        dispatch({ type: 'SET_SUMMARY_DATA', payload: result });
      }
    } catch (error) {
      console.error('Error fetching summary data:', error);
    }
  }, [token]);

  const fetchIncomeExpensesData = useCallback(async () => {
    try {
      const targetDate = getCurrentDate();
      const [incomeResponse, expensesResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/income-expenses/income?date=${targetDate}`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        }),
        fetch(`${API_BASE_URL}/api/income-expenses/expenses?date=${targetDate}`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        })
      ]);

      if (incomeResponse.ok) {
        const incomeResult = await incomeResponse.json();
        dispatch({ type: 'SET_INCOME_DATA', payload: incomeResult || [] });
      }

      if (expensesResponse.ok) {
        const expensesResult = await expensesResponse.json();
        dispatch({ type: 'SET_EXPENSES_DATA', payload: expensesResult || [] });
      }
    } catch (error) {
      console.error('Error fetching income/expenses data:', error);
    }
  }, [getCurrentDate, token]);

  const fetchPaymentsData = useCallback(async () => {
    try {
      const targetDate = getCurrentDate();
      const response = await fetch(`${API_BASE_URL}/api/payments?date=${targetDate}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        dispatch({ type: 'SET_PAYMENTS_DATA', payload: result.payment || {} });
      }
    } catch (error) {
      console.error('Error fetching payments data:', error);
    }
  }, [getCurrentDate, token]);

  const fetchClosingStockStatus = useCallback(async () => {
    try {
      const targetDate = getCurrentDate();
      const response = await fetch(`${API_BASE_URL}/api/shop/products?date=${targetDate}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        dispatch({ type: 'SET_CLOSING_STOCK_STATUS', payload: result.closingStockStatus });
      }
    } catch (error) {
      console.error('Error fetching closing stock status:', error);
    }
  }, [getCurrentDate, token]);

  // Main fetch function that calls all individual fetch functions
  const fetchAllData = useCallback(async () => {
    dispatch({ type: 'FETCH_START' });
    try {
      console.log('🔄 Starting to fetch all data...');
      const results = await Promise.allSettled([
        fetchStockData(),
        fetchSummaryData(),
        fetchIncomeExpensesData(),
        fetchPaymentsData(),
        fetchClosingStockStatus()
      ]);
      
      // Log results of each fetch
      results.forEach((result, index) => {
        const names = ['Stock', 'Summary', 'Income/Expenses', 'Payments', 'Closing Stock Status'];
        if (result.status === 'rejected') {
          console.error(`❌ ${names[index]} fetch failed:`, result.reason);
        } else {
          console.log(`✅ ${names[index]} fetch succeeded`);
        }
      });
      
      dispatch({ type: 'FETCH_SUCCESS', payload: {} });
    } catch (error) {
      console.error('Error fetching data:', error);
      dispatch({ type: 'FETCH_ERROR', payload: error });
    }
  }, [fetchStockData, fetchSummaryData, fetchIncomeExpensesData, fetchPaymentsData, fetchClosingStockStatus]);

  // Effect to fetch data when dates change
  useEffect(() => {
    if (dateMode === 'single' && selectedDate) {
      fetchAllData();
    } else if (dateMode === 'range' && startDate && endDate) {
      fetchAllData();
    }
  }, [fetchAllData, dateMode, selectedDate, startDate, endDate]);

  const calculateTotalSales = useCallback(() => {
    return state.stockData.reduce((total, item) => total + (item.salesValue || 0), 0);
  }, [state.stockData]);

  const canGeneratePDF = useCallback(() => {
    // Always allow PDF generation, regardless of closing stock status
    return true;
  }, []);

  const getValidationMessage = useCallback(() => {
    if (!state.closingStockStatus) return 'Loading validation status...';
    if (state.closingStockStatus.isFullySaved) return 'Ready to generate PDF';
    if (state.closingStockStatus.isPartiallySaved) {
      return `Closing stock incomplete: ${state.closingStockStatus.savedProducts}/${state.closingStockStatus.totalProducts} products saved. Unsaved items will assume closing stock = total stock (sales = 0).`;
    }
    return 'Closing stock not saved. Will assume closing stock = total stock (sales = 0) for all products.';
  }, [state.closingStockStatus]);

  const generateSingleTablePDF = useCallback(() => {
    console.log('generateSingleTablePDF called');
    console.log('state.stockData:', state.stockData);
    console.log('shopName:', shopName);
    
    dispatch({ type: 'SET_GENERATING', payload: true });
    
    try {
      const pdfContent = createSingleTablePDFContent();
      console.log('PDF content generated, length:', pdfContent.length);
      openPrintWindow(pdfContent);
    } catch (error) {
      console.error('Error generating PDF:', error);
      dispatch({ type: 'SET_GENERATING', payload: false });
    }
  }, [state, shopName, dateMode, selectedDate, startDate, calculateTotalSales]);

  const generateTwoTablePDF = useCallback(() => {
    dispatch({ type: 'SET_GENERATING', payload: true });
    const pdfContent = createTwoTablePDFContent();
    openPrintWindow(pdfContent);
  }, [state, shopName, dateMode, selectedDate, startDate, calculateTotalSales]);

  const openPrintWindow = (content) => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(content);
    printWindow.document.close();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
      dispatch({ type: 'SET_GENERATING', payload: false });
    }, 1000);
  };

  const createSingleTablePDFContent = () => {
    return createPDFContent(false);
  };

  const createTwoTablePDFContent = () => {
    return createPDFContent(true);
  };

  const createPDFContent = (twoTableFormat = false) => {
    console.log('createPDFContent called with twoTableFormat:', twoTableFormat);
    console.log('Available variables:', {
      'state.stockData length': state.stockData?.length,
      'shopName': shopName,
      'dateMode': dateMode,
      'selectedDate': selectedDate,
      'startDate': startDate
    });
    
    const formatDate = (dateStr) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'short', 
        year: '2-digit' 
      });
    };

    const formatCurrency = (amount) => {
      return Math.round(amount).toLocaleString('en-IN');
    };

    const totalSales = calculateTotalSales();
    console.log('PDF calculations:', {
      totalSales,
      incomeDataLength: state.incomeData?.length,
      expensesDataLength: state.expensesData?.length,
      paymentsData: state.paymentsData,
      summaryData: state.summaryData
    });
    
    const totalIncome = (state.incomeData || []).reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const totalExpenses = (state.expensesData || []).reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    
    const cash = state.paymentsData?.cash_amount || 0;
    const upi = state.paymentsData?.upi_amount || 0;
    const card = state.paymentsData?.card_amount || 0;
    
    const openingBalance = state.summaryData?.openingBalance || 0;
    const closingBalance = state.summaryData?.counterBalance || 0;
    
    // Calculate opening stock value: sum of (opening stock * price)
    const openingStockValue = state.stockData.reduce((total, item) => {
      return total + ((item.openingStock || 0) * (item.price || 0));
    }, 0);
    
    // Calculate closing stock value: sum of (closing stock * price)
    const closingStockValue = state.stockData.reduce((total, item) => {
      return total + ((item.closingStock || 0) * (item.price || 0));
    }, 0);

    // Calculate received stock value: sum of (received stock * price)
    const receivedStockValue = state.stockData.reduce((total, item) => {
      return total + ((item.receivedStock || 0) * (item.price || 0));
    }, 0);

    // Generate table rows
    const generateTableRows = (data) => {
      return data.map(item => `
        <tr>
          <td class="center">${item.serialNo}</td>
          <td class="brand-name">${item.brandName}(${item.brandNumber})</td>
          <td class="center">${item.sizeCode}</td>
          <td class="number">${item.openingStock}</td>
          <td class="number">${item.receivedStock}</td>
          <td class="number">${item.totalStock}</td>
          <td class="number">${item.closingStock}</td>
          <td class="number">${item.sales}</td>
          <td class="number">${Math.round(item.price)}</td>
          <td class="number">${formatCurrency(item.salesValue || 0)}</td>
        </tr>
      `).join('');
    };

    const generateTotalRow = (data) => {
      return `
        <tr class="bottles-totals-row">
          <td colspan="3">TOTAL BOTTLES</td>
          <td class="number red-text">${data.reduce((sum, item) => sum + (item.openingStock || 0), 0)}</td>
          <td class="number red-text">${data.reduce((sum, item) => sum + (item.receivedStock || 0), 0)}</td>
          <td class="number red-text">${data.reduce((sum, item) => sum + (item.totalStock || 0), 0)}</td>
          <td class="number red-text">${data.reduce((sum, item) => sum + (item.closingStock || 0), 0)}</td>
          <td class="number red-text">${data.reduce((sum, item) => sum + (item.sales || 0), 0)}</td>
          <td></td>
          <td class="number red-text">${formatCurrency(data.reduce((sum, item) => sum + (item.salesValue || 0), 0))}</td>
        </tr>
      `;
    };

    let tableContent = '';
    
    if (twoTableFormat && state.stockData.length > BUSINESS_CONFIG.TABLE_SPLIT_THRESHOLD) {
      const splitIndex = Math.ceil(state.stockData.length / 2);
      const leftData = state.stockData.slice(0, splitIndex);
      const rightData = state.stockData.slice(splitIndex);
      
      tableContent = `
        <div class="two-table-container">
          <div class="left-table">
            <table>
              <thead>
                <tr>
                  <th>SNO</th><th>NAME</th><th>Size Code</th><th>O.S</th><th>REC</th>
                  <th>TTL</th><th>C.S</th><th>SALE</th><th>MRP</th><th>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                ${generateTableRows(leftData)}
                ${generateTotalRow(leftData)}
              </tbody>
            </table>
          </div>
          <div class="right-table">
            <table>
              <thead>
                <tr>
                  <th>SNO</th><th>NAME</th><th>Size Code</th><th>O.S</th><th>REC</th>
                  <th>TTL</th><th>C.S</th><th>SALE</th><th>MRP</th><th>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                ${generateTableRows(rightData)}
                ${generateTotalRow(rightData)}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else {
      tableContent = `
        <table class="single-table">
          <thead>
            <tr>
              <th>SNO</th><th>NAME</th><th>Size Code</th><th>O.S</th><th>REC</th>
              <th>TTL</th><th>C.S</th><th>SALE</th><th>MRP</th><th>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${generateTableRows(state.stockData)}
            <tr class="bottles-totals-row">
              <td colspan="3">TOTAL BOTTLES</td>
              <td class="number red-text">${state.stockData.reduce((sum, item) => sum + (item.openingStock || 0), 0)}</td>
              <td class="number red-text">${state.stockData.reduce((sum, item) => sum + (item.receivedStock || 0), 0)}</td>
              <td class="number red-text">${state.stockData.reduce((sum, item) => sum + (item.totalStock || 0), 0)}</td>
              <td class="number red-text">${state.stockData.reduce((sum, item) => sum + (item.closingStock || 0), 0)}</td>
              <td class="number red-text">${state.stockData.reduce((sum, item) => sum + (item.sales || 0), 0)}</td>
              <td></td>
              <td class="number red-text">${formatCurrency(totalSales)}</td>
            </tr>
          </tbody>
        </table>
      `;
    }

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Sale Sheet - ${shopName}</title>
      <style>
        @page { margin: 10mm; size: ${twoTableFormat ? 'A3 portrait' : 'A4 portrait'}; }
        body { font-family: Arial, sans-serif; font-size: ${twoTableFormat ? '9px' : '11px'}; margin: 0; padding: 8px; }
        .sale-sheet-title { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 15px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid #000; }
        .shop-info { font-size: 16px; font-weight: bold; }
        .date-range { font-size: 16px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
        th, td { border: 1px solid #000; padding: 3px; text-align: center; }
        .number { text-align: right; }
        .brand-name { text-align: left; max-width: 200px; overflow: hidden; }
        .bottles-totals-row { font-weight: bold; border-top: 2px solid #000; }
        .red-text { color: #ff0000; }
        .two-table-container { display: flex; gap: 3px; }
        .left-table, .right-table { width: 48%; }
        .summary { margin-top: 15px; }
        .summary-table { width: 100%; border-collapse: collapse; margin: 10px 0; border: 2px solid #000; }
        .income-expenses-section { margin-top: 20px; }
        .income-table, .expenses-table { width: 100%; border-collapse: collapse; border: 2px solid #000; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="sale-sheet-title">Sale Sheet</div>
      <div class="header">
        <div class="shop-info">${shopName}</div>
        <div class="date-range">${formatDate(dateMode === 'single' ? selectedDate : startDate)} To ${formatDate(getCurrentDate())}</div>
      </div>

      ${tableContent}

      <div class="summary">
        <h3>SUMMARY:</h3>
        <table class="summary-table">
          <thead>
            <tr><th>S.No</th><th>PARTICULARS</th><th>AMOUNT</th></tr>
          </thead>
          <tbody>
            <tr><td>1</td><td>OPENING STOCK VALUE</td><td>${formatCurrency(openingStockValue)}</td></tr>
            <tr><td>2</td><td>RECEIVED STOCK VALUE</td><td>${formatCurrency(receivedStockValue)}</td></tr>
            <tr><td>3</td><td>CLOSING STOCK VALUE</td><td>${formatCurrency(closingStockValue)}</td></tr>
            <tr><td>4</td><td>TOTAL SALE</td><td>${formatCurrency(totalSales)}</td></tr>
            <tr><td>5</td><td>OTHER INCOME</td><td>${formatCurrency(totalIncome)}</td></tr>
            <tr><td>6</td><td>OPENING COUNTER BALANCE</td><td>${formatCurrency(openingBalance)}</td></tr>
            <tr><td>7</td><td>CASH</td><td>${formatCurrency(cash)}</td></tr>
            <tr><td>8</td><td>CARD</td><td>${formatCurrency(card)}</td></tr>
            <tr><td>9</td><td>UPI</td><td>${formatCurrency(upi)}</td></tr>
            <tr><td>10</td><td>EXPENSES</td><td>${formatCurrency(totalExpenses)}</td></tr>
            <tr><td>11</td><td>CLOSING COUNTER BALANCE</td><td>${formatCurrency(closingBalance)}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="income-expenses-section">
        <div>
          <h3>OTHER INCOME:</h3>
          <table class="income-table">
            <thead>
              <tr><th>S.No</th><th>SOURCE</th><th>AMOUNT</th></tr>
            </thead>
            <tbody>
              ${(state.incomeData || []).map((item, index) => 
                `<tr><td>${index + 1}</td><td>${item.source || 'N/A'}</td><td>${formatCurrency(item.amount || 0)}</td></tr>`
              ).join('')}
              ${(state.incomeData || []).length === 0 ? '<tr><td colspan="3">No income records</td></tr>' : ''}
              <tr class="bottles-totals-row">
                <td colspan="2"><strong>TOTAL</strong></td>
                <td><strong>${formatCurrency(totalIncome)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div>
          <h3>EXPENSES:</h3>
          <table class="expenses-table">
            <thead>
              <tr><th>S.No</th><th>CATEGORY</th><th>AMOUNT</th></tr>
            </thead>
            <tbody>
              ${(state.expensesData || []).map((item, index) => 
                `<tr><td>${index + 1}</td><td>${item.category || 'N/A'}</td><td>${formatCurrency(item.amount || 0)}</td></tr>`
              ).join('')}
              ${(state.expensesData || []).length === 0 ? '<tr><td colspan="3">No expense records</td></tr>' : ''}
              <tr class="bottles-totals-row">
                <td colspan="2"><strong>TOTAL</strong></td>
                <td><strong>${formatCurrency(totalExpenses)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </body>
    </html>
    `;
  };

  const handleDateModeChange = useCallback((mode) => {
    setDateMode(mode);
    if (mode === 'single') {
      setSelectedDate(businessDate);
    } else {
      setStartDate(businessDate);
      setEndDate(businessDate);
    }
  }, [businessDate]);

  // Render loading state
  if (state.fetchState === FETCH_STATES.LOADING) {
    return <LoadingDisplay />;
  }

  // Render error state
  if (state.fetchState === FETCH_STATES.ERROR) {
    return <ErrorDisplay error={state.error} onRetry={fetchAllData} />;
  }

  const totalBrands = calculations.totalProducts;
  const showBothFormats = calculations.showBothFormats;

  return (
    <div className="download-sale-sheet-container">
      <header className="sale-sheet-header">
        <div className="logo-section">
          <h1 className="app-title">{shopName}</h1>
          <p className="app-subtitle">Inventory Management</p>
        </div>
        <nav className="navigation">
          <button className="nav-btn" onClick={() => onNavigate('dashboard')}>Dashboard</button>
          <button className="nav-btn" onClick={() => onNavigate('stockOnboarding')}>Stock Onboarding</button>
          <button className="nav-btn" onClick={() => onNavigate('manageStock')}>Manage Stock</button>
          <button className="nav-btn" onClick={() => onNavigate('sheets')}>Sheets</button>
          <button className="nav-btn active" onClick={() => onNavigate('reports')}>Reports</button>
          <button className="nav-btn">Settings</button>
        </nav>
      </header>

      <main className="sale-sheet-content">
        <div className="page-title-section">
          <h2 className="main-title">Download Sale Sheet</h2>
          <p className="subtitle">Generate PDF sale sheet with financial summary</p>
        </div>

        <div className="controls-section">
          <div className="date-controls">
            <div className="date-mode-selector">
              <label className="radio-label">
                <input
                  type="radio"
                  name="dateMode"
                  value="single"
                  checked={dateMode === 'single'}
                  onChange={(e) => handleDateModeChange(e.target.value)}
                />
                <span>Single Date</span>
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="dateMode"
                  value="range"
                  checked={dateMode === 'range'}
                  onChange={(e) => handleDateModeChange(e.target.value)}
                />
                <span>Date Range</span>
              </label>
            </div>

            {dateMode === 'single' ? (
              <div className="single-date-input">
                <label>Date:</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
            ) : (
              <div className="date-range-inputs">
                <div className="date-input-group">
                  <label>Start Date:</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="date-input-group">
                  <label>End Date:</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="validation-status">
            <div className={`status-indicator ${state.closingStockStatus?.isFullySaved ? 'valid' : 'warning'}`}>
              {getValidationMessage()}
            </div>
          </div>
        </div>

        <div className="preview-section">
          <div className="data-summary">
            <h3>Data Summary</h3>
            <div className="summary-stats">
              <div className="stat-item">
                <span className="stat-label">Total Products:</span>
                <span className="stat-value">{totalBrands}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Total Sales:</span>
                <span className="stat-value">₹{calculations.totalSales.toLocaleString('en-IN')}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Date Range:</span>
                <span className="stat-value">{getDateRange()}</span>
              </div>
            </div>
          </div>

          <div className="download-options">
            <h3>Download Options</h3>
            {showBothFormats ? (
              <div className="multiple-formats">
                <button 
                  className="download-btn primary"
                  onClick={generateSingleTablePDF}
                  disabled={state.generating}
                >
                  {state.generating ? 'Generating...' : 'Download Single Table PDF'}
                </button>
                <button 
                  className="download-btn secondary"
                  onClick={generateTwoTablePDF}
                  disabled={state.generating}
                >
                  {state.generating ? 'Generating...' : 'Download Two-Table PDF'}
                </button>
                <p className="format-info">
                  Single table: All {totalBrands} products in one table<br/>
                  Two-table: Split into {Math.ceil(totalBrands/2)} + {Math.floor(totalBrands/2)} products side by side
                </p>
              </div>
            ) : (
              <div className="single-format">
                <button 
                  className="download-btn primary"
                  onClick={generateSingleTablePDF}
                  disabled={state.generating}
                >
                  {state.generating ? 'Generating...' : 'Download PDF'}
                </button>
                <p className="format-info">
                  Single table format for {totalBrands} products
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="info-section">
          <div className="info-card">
            <h4>📋 Report Contents</h4>
            <ul>
              <li>Complete stock movement (Opening, Received, Total, Closing, Sales)</li>
              <li>Sales values and pricing information</li>
              <li>Financial summary with opening/closing balances</li>
              <li>Payment collections (Cash, UPI, Card)</li>
              <li>Income and expense details</li>
            </ul>
          </div>
          
          <div className="info-card">
            <h4>📅 Date Logic</h4>
            <ul>
              <li><strong>Single Date:</strong> Shows complete stock data for selected date</li>
              <li><strong>Date Range:</strong> Opening stock from start date, closing stock from end date</li>
              <li>Business day starts at 11:30 AM IST</li>
              <li>All financial data uses the end date for calculations</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}

export default DownloadSaleSheet;
