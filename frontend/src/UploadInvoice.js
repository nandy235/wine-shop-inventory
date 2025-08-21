import React, { useState } from 'react';
import './UploadInvoice.css';
import API_BASE_URL from './config';

function UploadInvoice({ onNavigate }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [processing, setProcessing] = useState(false);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');
  const shopName = user.shopName || 'Liquor Ledger';

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setParsedData(null);
    } else {
      alert('Please select a PDF file');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      alert('Please select a file first');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('invoice', selectedFile);

    try {
      const response = await fetch(`${API_BASE_URL}/api/invoice/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setParsedData(data);
        alert(`✅ Invoice parsed successfully! Found ${data.items.length} items.`);
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.message}`);
      }
    } catch (error) {
      console.error('Error uploading invoice:', error);
      alert('❌ Error uploading invoice');
    }
    setUploading(false);
  };

  const handleConfirmAndAdd = async () => {
    if (!parsedData) return;

    setProcessing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/invoice/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invoiceData: parsedData
        })
      });

      if (response.ok) {
        const result = await response.json();
        alert(`✅ Stock updated successfully!\n${result.updatedCount} items added to received stock.`);
        
        // Reset form
        setSelectedFile(null);
        setParsedData(null);
        
        // Navigate to view stock
        onNavigate('viewCurrentStock');
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.message}`);
      }
    } catch (error) {
      console.error('Error confirming invoice:', error);
      alert('❌ Error processing invoice');
    }
    setProcessing(false);
  };

  const formatSize = (sizeCode, size) => {
    return `${sizeCode}(${size})`;
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '₹0';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  return (
    <div className="upload-invoice-container">
      <header className="invoice-header">
        <div className="logo-section">
          <h1 className="app-title">{shopName}</h1>
          <p className="app-subtitle">Inventory Management</p>
        </div>
        <nav className="navigation">
          <button className="nav-btn" onClick={() => onNavigate('dashboard')}>Dashboard</button>
          <button className="nav-btn" onClick={() => onNavigate('stockOnboarding')}>Stock Onboarding</button>
          <button className="nav-btn" onClick={() => onNavigate('manageStock')}>Manage Stock</button>
          <button className="nav-btn">Sheets</button>
          <button className="nav-btn">Reports</button>
          <button className="nav-btn">Settings</button>
        </nav>
      </header>

      <main className="invoice-content">
        <div className="page-title-section">
          <h2 className="main-title">Upload Invoice</h2>
          <p className="subtitle">Upload government invoice PDF to automatically update received stock</p>
        </div>

        <div className="upload-section">
          <div className="upload-card">
            <div className="upload-area">
              <div className="upload-icon">📄</div>
              <h3>Select Invoice PDF</h3>
              <p className="upload-info">Upload your government invoice to automatically parse and add to received stock</p>
              
              <input
                type="file"
                id="file-input"
                accept=".pdf"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              
              <label htmlFor="file-input" className="file-select-btn">
                Choose PDF File
              </label>
              
              {selectedFile && (
                <div className="selected-file">
                  <p>Selected: {selectedFile.name}</p>
                  <p className="file-size">Size: {(selectedFile.size / 1024).toFixed(2)} KB</p>
                </div>
              )}
              
              <button 
                className="upload-btn"
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
              >
                {uploading ? 'Parsing Invoice...' : 'Parse Invoice'}
              </button>
            </div>
          </div>

          {parsedData && (
            <div className="parsed-data-section">
              <h3>Parsed Invoice Data</h3>
              
              <div className="invoice-info">
                <p><strong>Invoice Number:</strong> {parsedData.invoiceNumber}</p>
                <p><strong>Date:</strong> {parsedData.date}</p>
                <div className="financial-breakdown">
                  <p><strong>Net Invoice Value:</strong> {formatCurrency(parsedData.netInvoiceValue)}</p>
                  <p><strong>Retail Excise Tax:</strong> {formatCurrency(parsedData.retailExciseTax)}</p>
                  <p><strong>Special Excise Cess:</strong> {formatCurrency(parsedData.specialExciseCess)}</p>
                  <p><strong>TCS:</strong> {formatCurrency(parsedData.tcs)}</p>
                  <p className="total-amount">
                    <strong>Total Purchase Value:</strong> {formatCurrency(parsedData.totalAmount)}
                  </p>
                </div>
              </div>

              <div className="items-table">
                <h4>Items Found ({parsedData.items.length})</h4>
                <table>
                  <thead>
                    <tr>
                      <th>Brand Number</th>
                      <th>Description</th>
                      <th>Size</th>
                      <th>Cases</th>
                      <th>Bottles</th>
                      <th>Total Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.items.map((item, index) => (
                      <tr key={index}>
                        <td>{item.brandNumber}</td>
                        <td>{item.description}</td>
                        <td>{formatSize(item.sizeCode, item.size)}</td>
                        <td>{item.cases}</td>
                        <td>{item.bottles}</td>
                        <td>{item.totalQuantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="action-buttons">
                <button 
                  className="confirm-btn"
                  onClick={handleConfirmAndAdd}
                  disabled={processing}
                >
                  {processing ? 'Processing...' : 'Confirm & Add to Stock'}
                </button>
                <button 
                  className="cancel-btn"
                  onClick={() => {
                    setParsedData(null);
                    setSelectedFile(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="info-section">
          <div className="info-card">
            <h4>📋 Supported Format</h4>
            <p>Government invoice PDFs with standard format including:</p>
            <ul>
              <li>Brand numbers with pack quantities (e.g., 0110 (48))</li>
              <li>Package sizes (180ml, 375ml, 750ml, etc.)</li>
              <li>Case and bottle quantities</li>
              <li>All applicable taxes and charges</li>
            </ul>
          </div>
          
          <div className="info-card">
            <h4>✅ Auto-Processing</h4>
            <p>The system will automatically:</p>
            <ul>
              <li>Parse PDF and extract product details</li>
              <li>Match products with master brands</li>
              <li>Calculate total quantities</li>
              <li>Update received stock in daily records</li>
              <li>Calculate total purchase value with taxes</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}

export default UploadInvoice;