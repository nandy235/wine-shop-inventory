import React, { useState, useEffect, useCallback, useMemo } from 'react';
import useBusinessDate from './hooks/useBusinessDate';
import './StockTransferReport.css';
import { apiGet } from './apiUtils';
import { getCurrentUser } from './authUtils';
import Navigation from './components/Navigation';

function StockTransferReport({ onNavigate, onLogout }) {
  // Use business date hook
  const businessDate = useBusinessDate();
  
  // Date state
  const [selectedDate, setSelectedDate] = useState(businessDate);
  
  // Stock transfer data state
  const [shiftedInData, setShiftedInData] = useState([]);
  const [shiftedOutData, setShiftedOutData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Update form dates when business date changes
  useEffect(() => {
    setSelectedDate(businessDate);
  }, [businessDate]);

  // Memoized user data
  const userData = useMemo(() => getCurrentUser(), []);
  const shopName = useMemo(() => userData.shopName || 'Liquor Ledger', [userData.shopName]);

  // Fetch stock transfer data
  const fetchStockTransferData = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      console.log(`Fetching stock transfer data for date: ${selectedDate}`);
      
      const [shiftedInResponse, shiftedOutResponse] = await Promise.all([
        apiGet(`/api/stock-transfers/shifted-in?date=${selectedDate}`),
        apiGet(`/api/stock-transfers/shifted-out?date=${selectedDate}`)
      ]);
      
      const shiftedInResult = await shiftedInResponse.json();
      const shiftedOutResult = await shiftedOutResponse.json();
      
      console.log('📥 Shifted In API Response:', shiftedInResult);
      console.log('📤 Shifted Out API Response:', shiftedOutResult);
      
      // The backend already processes the data and wraps it in a 'transfers' property
      const processedShiftedIn = shiftedInResult.transfers || [];
      const processedShiftedOut = shiftedOutResult.transfers || [];
      
      setShiftedInData(processedShiftedIn);
      setShiftedOutData(processedShiftedOut);
      
    } catch (error) {
      console.error('Error fetching stock transfer data:', error);
      setError('Failed to load stock transfer data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // Effect to fetch data when date changes
  useEffect(() => {
    if (selectedDate) {
      fetchStockTransferData();
    }
  }, [fetchStockTransferData]);

  // PDF download function
  const downloadStockTransferPDF = useCallback(() => {
    const currentDate = new Date(selectedDate).toLocaleDateString('en-GB');
    const shopName = userData.shopName || 'Liquor Ledger';
    
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Stock Transfer Report - ${currentDate}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #2c3e50; margin: 0; }
        .header h2 { color: #7f8c8d; margin: 5px 0; }
        .section { margin-bottom: 30px; }
        .section-title { background: #3498db; color: white; padding: 10px; margin: 0; font-size: 16px; font-weight: bold; text-align: center; }
        table { width: 100%; border-collapse: collapse; margin-top: 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        .no-data { text-align: center; color: #7f8c8d; font-style: italic; }
        .brand-name { font-weight: bold; }
        .quantity { text-align: center; }
        .shop-name { font-style: italic; }
        .date { text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Stock Transfer Report</h1>
        <h2>${shopName}</h2>
        <h3>Date: ${currentDate}</h3>
      </div>
      
      <div class="section">
        <h3 class="section-title">Stock Shifted In</h3>
        <table>
          <thead>
            <tr>
              <th>S.No</th>
              <th>Brand Name</th>
              <th>Size Code</th>
              <th>Quantity</th>
              <th>Shop Name (Retailer Code)</th>
              <th>Transfer Date</th>
            </tr>
          </thead>
          <tbody>
            ${shiftedInData.length === 0 ? 
              '<tr><td colspan="6" class="no-data">No stock shifted in for selected date</td></tr>' :
              shiftedInData.map((item, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td class="brand-name">${item.brandName} (${item.brandNumber})</td>
                  <td>${item.sizeCode}</td>
                  <td class="quantity">${item.quantity}</td>
                  <td class="shop-name">${item.supplierName} (${item.supplierCode})</td>
                  <td class="date">${new Date(item.transferDate).toLocaleDateString('en-GB')}</td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>
      
      <div class="section">
        <h3 class="section-title">Stock Shifted Out</h3>
        <table>
          <thead>
            <tr>
              <th>S.No</th>
              <th>Brand Name</th>
              <th>Size Code</th>
              <th>Quantity</th>
              <th>Shop Name (Retailer Code)</th>
              <th>Transfer Date</th>
            </tr>
          </thead>
          <tbody>
            ${shiftedOutData.length === 0 ? 
              '<tr><td colspan="6" class="no-data">No stock shifted out for selected date</td></tr>' :
              shiftedOutData.map((item, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td class="brand-name">${item.brandName} (${item.brandNumber})</td>
                  <td>${item.sizeCode}</td>
                  <td class="quantity">${item.quantity}</td>
                  <td class="shop-name">${item.supplierName} (${item.supplierCode})</td>
                  <td class="date">${new Date(item.transferDate).toLocaleDateString('en-GB')}</td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>
    </body>
    </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  }, [selectedDate, userData.shopName, shiftedInData, shiftedOutData]);

  return (
    <div className="stock-transfer-report-container">
      <Navigation 
        currentPage="stockTransferReport"
        onNavigate={onNavigate}
        onLogout={onLogout}
        shopName={shopName}
      />

      <main className="report-content">
        <div className="page-title-section">
          <h2 className="main-title">Stock Transfer Report</h2>
          <p className="subtitle">View and download stock transfer reports</p>
        </div>

        <div className="controls-section">
          <div className="date-controls">
            <div className="single-date-input">
              <label>Date:</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          </div>
          <div className="action-controls">
            <button 
              className="download-pdf-btn"
              onClick={downloadStockTransferPDF}
              disabled={loading}
            >
              📄 Download PDF
            </button>
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <span>Loading stock transfer data...</span>
          </div>
        ) : (
          <div className="transfer-tables-container">
            <div className="transfer-table-section">
              <h3 className="table-title">Stock Shifted In</h3>
              <div className="table-container">
                <table className="transfer-table">
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Brand Name</th>
                      <th>Size Code</th>
                      <th>Quantity</th>
                      <th>Shop Name (Retailer Code)</th>
                      <th>Transfer Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shiftedInData.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="no-data">No stock shifted in for selected date</td>
                      </tr>
                    ) : (
                      shiftedInData.map((item) => (
                        <tr key={item.id}>
                          <td>{item.serialNo}</td>
                          <td className="brand-name">
                            {item.brandName} ({item.brandNumber})
                          </td>
                          <td>{item.sizeCode}</td>
                          <td className="quantity">{item.quantity}</td>
                          <td className="shop-name">
                            {item.supplierName} ({item.supplierCode})
                          </td>
                          <td className="date">
                            {new Date(item.transferDate).toLocaleDateString('en-GB')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="transfer-table-section">
              <h3 className="table-title">Stock Shifted Out</h3>
              <div className="table-container">
                <table className="transfer-table">
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Brand Name</th>
                      <th>Size Code</th>
                      <th>Quantity</th>
                      <th>Shop Name (Retailer Code)</th>
                      <th>Transfer Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shiftedOutData.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="no-data">No stock shifted out for selected date</td>
                      </tr>
                    ) : (
                      shiftedOutData.map((item) => (
                        <tr key={item.id}>
                          <td>{item.serialNo}</td>
                          <td className="brand-name">
                            {item.brandName} ({item.brandNumber})
                          </td>
                          <td>{item.sizeCode}</td>
                          <td className="quantity">{item.quantity}</td>
                          <td className="shop-name">
                            {item.supplierName} ({item.supplierCode})
                          </td>
                          <td className="date">
                            {new Date(item.transferDate).toLocaleDateString('en-GB')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default StockTransferReport;
