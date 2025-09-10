import React, { useState, useRef } from 'react';
import './UploadInvoice.css';
import API_BASE_URL from './config';
import SettingsDropdown from './SettingsDropdown';

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

function UploadInvoice({ onNavigate, onLogout }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef(null);


  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');
  const shopName = user.shopName || 'Liquor Ledger';

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    console.log('File selected:', file); // Debug log
    console.log('File type:', file?.type); // Debug log
    console.log('File name:', file?.name); // Debug log
    
    if (file) {
      // Check if it's a PDF file
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      console.log('Is PDF:', isPdf); // Debug log
      
      if (isPdf) {
        console.log('Setting selected file...'); // Debug log
        setSelectedFile(file);
        setParsedData(null);
        console.log('PDF file accepted:', file.name);
        console.log('Selected file state should now be:', file); // Debug log
      } else {
        console.log('File rejected - not a PDF'); // Debug log
        alert('Please select a PDF file');
        // Clear the input
        e.target.value = '';
      }
    } else {
      console.log('No file selected'); // Debug log
    }
  };

  const handleFileButtonClick = () => {
    console.log('File button clicked'); // Debug log
    
    // Try useRef approach first
    if (fileInputRef.current) {
      console.log('Using useRef approach'); // Debug log
      try {
        fileInputRef.current.click();
        console.log('useRef click() called successfully'); // Debug log
        return;
      } catch (error) {
        console.error('Error with useRef click():', error);
      }
    }
    
    // Fallback to getElementById
    const fileInput = document.getElementById('file-input');
    console.log('File input element:', fileInput); // Debug log
    console.log('File input type:', fileInput?.type); // Debug log
    console.log('File input accept:', fileInput?.accept); // Debug log
    
    if (fileInput) {
      try {
        fileInput.click();
        console.log('getElementById click() called successfully'); // Debug log
      } catch (error) {
        console.error('Error calling click():', error);
      }
    } else {
      console.error('File input element not found');
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
        alert(`✅ Invoice processed successfully! Found ${data.items.length} items.`);
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
    if (!parsedData || !parsedData.tempId) return;

    setProcessing(true);
    try {
      const businessDate = getBusinessDate();
      console.log('🗓️ Using business date:', businessDate);
      
      const response = await fetch(`${API_BASE_URL}/api/invoice/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tempId: parsedData.tempId,
          businessDate: businessDate
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
        try {
          const error = await response.json();
          console.error('Server error response:', error);
          alert(`❌ Error: ${error.message || 'Server error during invoice confirmation'}`);
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
          alert(`❌ Server error (${response.status}): ${response.statusText}`);
        }
      }
    } catch (error) {
      console.error('Error confirming invoice:', error);
      alert(`❌ Error processing invoice: ${error.message || 'Network error'}`);
    }
    setProcessing(false);
  };

  const handleCancel = async () => {
    if (!parsedData || !parsedData.tempId) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/invoice/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tempId: parsedData.tempId
        })
      });

      if (response.ok) {
        console.log('Invoice cancelled successfully');
      } else {
        console.warn('Failed to cancel invoice on server');
      }
    } catch (error) {
      console.warn('Error cancelling invoice:', error);
    }

    // Reset form regardless of server response
    setSelectedFile(null);
    setParsedData(null);
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
          <button className="nav-btn active" onClick={() => onNavigate('manageStock')}>Manage Stock</button>
          <button className="nav-btn" onClick={() => onNavigate('sheets')}>Sheets</button>
          <button className="nav-btn" onClick={() => onNavigate('reports')}>Reports</button>
          <SettingsDropdown onLogout={onLogout} />
        </nav>
      </header>

      <main className="invoice-content">
        <div className="page-title-section">
          <h2 className="main-title">Upload Invoice</h2>
          <p className="subtitle">Upload government invoice PDF to automatically update received stock</p>
        </div>

        <div className="upload-section">
          <div className="upload-card">
            <div className={`upload-area ${selectedFile ? 'has-file' : ''}`}>
              <div className="upload-icon">
                {selectedFile ? '✅' : '📄'}
              </div>
              <h3>{selectedFile ? 'File Selected' : 'Select Invoice PDF'}</h3>
              {!selectedFile && (
                <p className="file-requirements">
                  (PDF files only, max 5MB)
                </p>
              )}
              {!selectedFile && (
                <p className="upload-info">
                  Upload your government invoice to automatically read and add to received stock
                </p>
              )}
              
              <input
                type="file"
                id="file-input"
                ref={fileInputRef}
                accept=".pdf,application/pdf"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              
              <button 
                type="button"
                className="file-select-btn"
                onClick={handleFileButtonClick}
              >
                Choose PDF File
              </button>
              
              {/* Fallback visible file input for debugging */}
              <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                <p>If the button above doesn't work, try this direct file input:</p>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileSelect}
                  style={{ 
                    padding: '5px', 
                    border: '1px solid #ddd', 
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                />
              </div>
              
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
                {uploading ? 'Reading Invoice...' : 'Read Invoice'}
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
                  <p><strong>Invoice Value:</strong> {formatCurrency(parsedData.invoiceValue)}</p>
                  <p><strong>MRP Rounding Off:</strong> {formatCurrency(parsedData.mrpRoundingOff)}</p>
                  
                  <p><strong>Retail Shop Excise Turnover Tax:</strong> {formatCurrency(parsedData.retailExciseTurnoverTax)}</p>
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
                      <th>S.No</th>
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
                        <td>{item.serial || (index + 1)}</td>
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
                  className="cancel-btn"
                  onClick={handleCancel}
                >
                  Cancel
                </button>
                <button 
                  className="confirm-btn"
                  onClick={handleConfirmAndAdd}
                  disabled={processing}
                >
                  {processing ? 'Processing...' : 'Confirm & Add to Stock'}
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