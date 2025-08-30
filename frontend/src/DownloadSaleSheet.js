import React, { useState, useEffect } from 'react';
import './DownloadSaleSheet.css';
import API_BASE_URL from './config';

// Helper function to get business date (day starts at 11:30 AM)
function getBusinessDate() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  
  if (istTime.getHours() < 11 || (istTime.getHours() === 11 && istTime.getMinutes() < 30)) {
    const yesterday = new Date(istTime);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toLocaleDateString('en-CA');
  } else {
    return istTime.toLocaleDateString('en-CA');
  }
}

function DownloadSaleSheet({ onNavigate }) {
  const [dateMode, setDateMode] = useState('single');
  const [selectedDate, setSelectedDate] = useState(getBusinessDate());
  const [startDate, setStartDate] = useState(getBusinessDate());
  const [endDate, setEndDate] = useState(getBusinessDate());
  const [stockData, setStockData] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [incomeData, setIncomeData] = useState([]);
  const [expensesData, setExpensesData] = useState([]);
  const [paymentsData, setPaymentsData] = useState(null);
  const [closingStockStatus, setClosingStockStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');
  const shopName = user.shopName || 'Liquor Ledger';

  useEffect(() => {
    if (dateMode === 'single' && selectedDate) {
      fetchAllData();
    } else if (dateMode === 'range' && startDate && endDate) {
      fetchAllData();
    }
  }, [selectedDate, startDate, endDate, dateMode]);

  const getCurrentDate = () => {
    return dateMode === 'single' ? selectedDate : endDate;
  };

  const getDateRange = () => {
    return dateMode === 'single' ? selectedDate : `${startDate} to ${endDate}`;
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchStockData(),
        fetchSummaryData(),
        fetchIncomeExpensesData(),
        fetchPaymentsData(),
        fetchClosingStockStatus()
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Error loading data. Please try again.');
    }
    setLoading(false);
  };

  const fetchStockData = async () => {
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
          
          const salesData = products.map((item, index) => {
            const openingStock = item.openingStock || 0;
            const receivedStock = item.receivedStock || 0;
            const totalStock = openingStock + receivedStock;
            const closingStock = item.closingStock !== null ? item.closingStock : totalStock;
            const sales = Math.max(0, totalStock - closingStock);
            
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

          setStockData(salesData);
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
            const receivedStock = startItem.receivedStock || 0;
            const totalStock = openingStock + receivedStock;
            const closingStock = endItem ? (endItem.closingStock !== null ? endItem.closingStock : endItem.totalStock) : totalStock;
            const sales = Math.max(0, totalStock - closingStock);
            
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

          setStockData(salesData);
        }
      }
    } catch (error) {
      console.error('Error fetching stock data:', error);
    }
  };

  const fetchSummaryData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/summary`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        setSummaryData(result);
      }
    } catch (error) {
      console.error('Error fetching summary data:', error);
    }
  };

  const fetchIncomeExpensesData = async () => {
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
        setIncomeData(incomeResult || []);
      }

      if (expensesResponse.ok) {
        const expensesResult = await expensesResponse.json();
        setExpensesData(expensesResult || []);
      }
    } catch (error) {
      console.error('Error fetching income/expenses data:', error);
    }
  };

  const fetchPaymentsData = async () => {
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
        setPaymentsData(result.payment || {});
      }
    } catch (error) {
      console.error('Error fetching payments data:', error);
    }
  };

  const fetchClosingStockStatus = async () => {
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
        setClosingStockStatus(result.closingStockStatus);
      }
    } catch (error) {
      console.error('Error fetching closing stock status:', error);
    }
  };

  const calculateTotalSales = () => {
    return stockData.reduce((total, item) => total + item.salesValue, 0);
  };

  const canGeneratePDF = () => {
    return closingStockStatus?.isFullySaved === true;
  };

  const getValidationMessage = () => {
    if (!closingStockStatus) return 'Loading validation status...';
    if (closingStockStatus.isFullySaved) return 'Ready to generate PDF';
    if (closingStockStatus.isPartiallySaved) {
      return `Closing stock incomplete: ${closingStockStatus.savedProducts}/${closingStockStatus.totalProducts} products saved`;
    }
    return 'Closing stock not saved. Please update closing stock first.';
  };

  const generateSingleTablePDF = () => {
    if (!canGeneratePDF()) {
      alert('Cannot generate PDF: ' + getValidationMessage());
      return;
    }
    setGenerating(true);
    const pdfContent = createSingleTablePDFContent();
    openPrintWindow(pdfContent);
  };

  const generateTwoTablePDF = () => {
    if (!canGeneratePDF()) {
      alert('Cannot generate PDF: ' + getValidationMessage());
      return;
    }
    setGenerating(true);
    const pdfContent = createTwoTablePDFContent();
    openPrintWindow(pdfContent);
  };

  const openPrintWindow = (content) => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(content);
    printWindow.document.close();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
      setGenerating(false);
    }, 1000);
  };

  const createSingleTablePDFContent = () => {
    return createPDFContent(false);
  };

  const createTwoTablePDFContent = () => {
    return createPDFContent(true);
  };

  const createPDFContent = (twoTableFormat = false) => {
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
    const totalIncome = (incomeData || []).reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const totalExpenses = (expensesData || []).reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    
    const cash = paymentsData?.cash_amount || 0;
    const upi = paymentsData?.upi_amount || 0;
    const card = paymentsData?.card_amount || 0;
    
    const openingBalance = summaryData?.openingBalance || 0;
    const closingBalance = summaryData?.counterBalance || 0;
    const openingStockValue = summaryData?.stockValue || 0; // This would need to be calculated for opening
    const closingStockValue = summaryData?.stockValue || 0;

    let tableContent = '';
    
    if (twoTableFormat && stockData.length > 20) {
      const splitIndex = Math.ceil(stockData.length / 2);
      const leftData = stockData.slice(0, splitIndex);
      const rightData = stockData.slice(splitIndex);
      
      tableContent = `
        <div class="two-table-container">
          <div class="left-table">
            <table>
              <thead>
                <tr>
                  <th>SNO</th>
                  <th>NAME</th>
                  <th>Size Code</th>
                  <th>O.S</th>
                  <th>REC</th>
                  <th>TTL</th>
                  <th>C.S</th>
                  <th>SALE</th>
                  <th>MRP</th>
                  <th>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                ${leftData.map(item => `
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
                    <td class="number">${formatCurrency(item.salesValue)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="right-table">
            <table>
              <thead>
                <tr>
                  <th>SNO</th>
                  <th>NAME</th>
                  <th>Size Code</th>
                  <th>O.S</th>
                  <th>REC</th>
                  <th>TTL</th>
                  <th>C.S</th>
                  <th>SALE</th>
                  <th>MRP</th>
                  <th>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                ${rightData.map(item => `
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
                    <td class="number">${formatCurrency(item.salesValue)}</td>
                  </tr>
                `).join('')}
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
              <th>SNO</th>
              <th>NAME</th>
              <th>Size Code</th>
              <th>O.S</th>
              <th>REC</th>
              <th>TTL</th>
              <th>C.S</th>
              <th>SALE</th>
              <th>MRP</th>
              <th>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${stockData.map(item => `
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
                <td class="number">${formatCurrency(item.salesValue)}</td>
              </tr>
            `).join('')}
            <tr class="totals-row">
              <td colspan="7">TOTALS</td>
              <td class="number">${stockData.reduce((sum, item) => sum + item.sales, 0)}</td>
              <td></td>
              <td class="number">${formatCurrency(totalSales)}</td>
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
        @page {
          margin: 10mm;
          size: A4 ${twoTableFormat ? 'landscape' : 'portrait'};
        }
        body {
          font-family: 'Arial', sans-serif;
          font-size: ${twoTableFormat ? '9px' : '11px'};
          line-height: 1.1;
          margin: 0;
          padding: 8px;
        }
        .sale-sheet-title {
          text-align: center;
          margin-bottom: 10px;
          padding: 5px 0;
        }
        .title {
          font-size: ${twoTableFormat ? '18px' : '20px'};
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 2px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
          padding: 5px 0;
          border-bottom: 1px solid #000;
        }
        .shop-info {
          font-size: ${twoTableFormat ? '14px' : '16px'};
          font-weight: bold;
          text-align: left;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .date-range {
          font-size: ${twoTableFormat ? '11px' : '13px'};
          font-weight: bold;
          text-align: right;
        }
        .two-table-container {
          display: flex;
          justify-content: space-between;
          gap: 10px;
        }
        .left-table, .right-table {
          width: 48%;
        }
        .single-table {
          width: 100%;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: ${twoTableFormat ? '8px' : '10px'};
          border: 2px solid #000;
        }
        th, td {
          border: 1px solid #000;
          padding: 3px 2px;
          text-align: center;
          vertical-align: middle;
        }
        th {
          background-color: #ffffff;
          font-weight: bold;
          text-align: center;
          font-size: ${twoTableFormat ? '8px' : '9px'};
          border: 1px solid #000;
        }
        .number {
          text-align: right;
        }
        .center {
          text-align: center;
        }
        .brand-name {
          max-width: ${twoTableFormat ? '100px' : '200px'};
          overflow: hidden;
          font-size: ${twoTableFormat ? '7px' : '9px'};
          text-align: left;
          padding-left: 4px;
        }
        .totals-row {
          font-weight: bold;
          background-color: #ffffff;
          border-top: 2px solid #000;
        }
        .summary {
          margin-top: 15px;
          font-size: 10px;
          page-break-inside: avoid;
          text-align: center;
        }
        .summary-table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
          font-size: ${twoTableFormat ? '8px' : '9px'};
          border: 2px solid #000;
        }
        .summary-table th,
        .summary-table td {
          border: 1px solid #000;
          padding: 3px 2px;
          text-align: center;
          vertical-align: middle;
        }
        .summary-table th {
          background-color: #ffffff;
          font-weight: bold;
          font-size: ${twoTableFormat ? '8px' : '9px'};
        }
        .summary-table td {
          text-align: center;
        }
        .summary h3,
        .summary h4 {
          text-align: left;
          margin: 10px 0 5px 0;
        }
        .summary-row {
          margin: 2px 0;
          display: flex;
          justify-content: space-between;
        }
        .summary-section {
          margin-top: 10px;
        }
        .summary-section h4 {
          margin: 5px 0;
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="sale-sheet-title">
        <div class="title">Sale Sheet</div>
      </div>
      
      <div class="header">
        <div class="shop-info">${shopName}</div>
        <div class="date-range">${formatDate(dateMode === 'single' ? selectedDate : startDate)} To ${formatDate(getCurrentDate())}</div>
      </div>

      ${tableContent}

      <div class="summary">
        <h3>SUMMARY:</h3>
        <table class="summary-table">
          <thead>
            <tr>
              <th>S.No</th>
              <th>PARTICULARS</th>
              <th>AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>OPENING STOCK VALUE</td>
              <td>${formatCurrency(openingStockValue)}</td>
            </tr>
            <tr>
              <td>2</td>
              <td>CLOSING STOCK VALUE</td>
              <td>${formatCurrency(closingStockValue)}</td>
            </tr>
            <tr>
              <td>3</td>
              <td>TOTAL SALE</td>
              <td>${formatCurrency(totalSales)}</td>
            </tr>
            <tr>
              <td>4</td>
              <td>OTHER INCOME</td>
              <td>${formatCurrency(totalIncome)}</td>
            </tr>
            <tr>
              <td>5</td>
              <td>OPENING COUNTER BALANCE</td>
              <td>${formatCurrency(openingBalance)}</td>
            </tr>
            <tr>
              <td>6</td>
              <td>CASH</td>
              <td>${formatCurrency(cash)}</td>
            </tr>
            <tr>
              <td>7</td>
              <td>CARD</td>
              <td>${formatCurrency(card)}</td>
            </tr>
            <tr>
              <td>8</td>
              <td>UPI</td>
              <td>${formatCurrency(upi)}</td>
            </tr>
            <tr>
              <td>9</td>
              <td>EXPENSES</td>
              <td>${formatCurrency(totalExpenses)}</td>
            </tr>
            <tr>
              <td>10</td>
              <td>CLOSING COUNTER BALANCE</td>
              <td>${formatCurrency(closingBalance)}</td>
            </tr>
          </tbody>
        </table>

        ${expensesData.length > 0 ? `
        <div class="summary-section">
          <h4>EXPENSES:</h4>
          <table class="summary-table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>CATEGORY</th>
                <th>DESCRIPTION</th>
                <th>AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              ${expensesData.map((expense, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${expense.category}</td>
                  <td>${expense.description || '-'}</td>
                  <td>${formatCurrency(expense.amount)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        ${incomeData.length > 0 ? `
        <div class="summary-section">
          <h4>OTHER INCOME:</h4>
          <table class="summary-table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>SOURCE</th>
                <th>DESCRIPTION</th>
                <th>AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              ${incomeData.map((income, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${income.source}</td>
                  <td>${income.description || '-'}</td>
                  <td>${formatCurrency(income.amount)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}
      </div>
    </body>
    </html>
    `;
  };

  const handleDateModeChange = (mode) => {
    setDateMode(mode);
    if (mode === 'single') {
      setSelectedDate(getBusinessDate());
    } else {
      setStartDate(getBusinessDate());
      setEndDate(getBusinessDate());
    }
  };

  if (loading) {
    return (
      <div className="download-sale-sheet-container">
        <div className="loading-container">Loading sale sheet data...</div>
      </div>
    );
  }

  const totalBrands = stockData.length;
  const showBothFormats = totalBrands > 20;

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
            <div className={`status-indicator ${canGeneratePDF() ? 'valid' : 'invalid'}`}>
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
                <span className="stat-value">₹{calculateTotalSales().toLocaleString('en-IN')}</span>
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
                  disabled={!canGeneratePDF() || generating}
                >
                  {generating ? 'Generating...' : 'Download Single Table PDF'}
                </button>
                <button 
                  className="download-btn secondary"
                  onClick={generateTwoTablePDF}
                  disabled={!canGeneratePDF() || generating}
                >
                  {generating ? 'Generating...' : 'Download Two-Table PDF'}
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
                  disabled={!canGeneratePDF() || generating}
                >
                  {generating ? 'Generating...' : 'Download PDF'}
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
