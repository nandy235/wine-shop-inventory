import React, { useState, useEffect, useRef } from 'react';
import './IndentEstimate.css';
import API_BASE_URL from './config';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function IndentEstimate({ onNavigate, onBack }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showEstimate, setShowEstimate] = useState(false);
  const [tenTimesCompleted, setTenTimesCompleted] = useState(false);
  const searchContainerRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const shopName = user.shopName || 'Liquor Ledger';

  const handleSearch = async (term) => {
    const searchQuery = term || searchTerm;
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/search-brands?q=${encodeURIComponent(searchQuery)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.brands || []);
        setShowResults(true);
      } else {
        console.error('Search failed');
        setSearchResults([]);
        setShowResults(false);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
      setShowResults(false);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Set new timeout for real-time search
    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(value);
    }, 300); // 300ms delay
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      handleSearch();
    }
  };

  // Handle click outside to close results
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const addToEstimate = (brand) => {
    const existingItem = selectedItems.find(item => item.id === brand.id);
    if (existingItem) {
      alert('This item is already added to the estimate');
      return;
    }

    const invoicePrice = parseFloat(brand.invoice) || 0;
    const packQuantity = brand.pack_quantity || 12;
    const totalBottles = 1 * packQuantity; // 1 case * pack quantity
    const newItem = {
      id: brand.id,
      brandName: brand.brand_name,
      brandNumber: brand.brand_number,
      size: `${packQuantity}/${brand.size_ml}ml`,
      sizeCode: brand.size_code,
      cases: 1,
      bottles: 0,
      packQuantity: packQuantity,
      invoicePrice: invoicePrice,
      specialMargin: parseFloat(brand.special_margin) || 0,
      specialExciseCess: parseFloat(brand.special_excise_cess) || 0,
      amount: totalBottles * invoicePrice
    };

    setSelectedItems([...selectedItems, newItem]);
    setShowResults(false);
    setSearchTerm('');
  };

  const updateQuantity = (id, field, value) => {
    const numValue = parseInt(value) || 0;
    setSelectedItems(items => 
      items.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: numValue };
          const totalBottles = (updatedItem.cases * updatedItem.packQuantity) + updatedItem.bottles;
          updatedItem.amount = totalBottles * updatedItem.invoicePrice;
          return updatedItem;
        }
        return item;
      })
    );
  };

  const removeItem = (id) => {
    setSelectedItems(items => items.filter(item => item.id !== id));
  };

  const getTotalBottles = () => {
    return selectedItems.reduce((total, item) => {
      const totalBottles = (item.cases * item.packQuantity) + item.bottles;
      return total + totalBottles;
    }, 0);
  };

  const calculateEstimate = () => {
    const invoiceValue = selectedItems.reduce((total, item) => total + item.amount, 0);
    const mrpRoundingOff = selectedItems.reduce((total, item) => {
      const totalBottles = (item.cases * item.packQuantity) + item.bottles;
      return total + (totalBottles * item.specialMargin);
    }, 0);
    const netInvoiceValue = invoiceValue + mrpRoundingOff;
    const retailExciseTurnoverTax = tenTimesCompleted ? invoiceValue * 0.10 : 0;
    const specialExciseCess = selectedItems.reduce((total, item) => {
      const totalBottles = (item.cases * item.packQuantity) + item.bottles;
      return total + (totalBottles * item.specialExciseCess);
    }, 0);
    const tcs = invoiceValue * 0.01175;

    return {
      invoiceValue,
      mrpRoundingOff,
      netInvoiceValue,
      retailExciseTurnoverTax,
      specialExciseCess,
      tcs,
      grandTotal: netInvoiceValue + retailExciseTurnoverTax + specialExciseCess + tcs
    };
  };

  const generatePDF = () => {
    if (selectedItems.length === 0) {
      alert('Please add items to the estimate before generating PDF');
      return;
    }

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      
      // Header
      doc.setFontSize(20);
      doc.setFont(undefined, 'bold');
      doc.text('Indent Estimate', pageWidth / 2, 20, { align: 'center' });
      
      doc.setFontSize(12);
      doc.setFont(undefined, 'normal');
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, pageWidth / 2, 30, { align: 'center' });
      
      // Items Table - Force use autoTable
      const tableColumns = [
        'S.No',
        'Brand Name', 
        'Size',
        'Cases',
        'Bottles',
        'Invoice Price',
        'Amount'
      ];
      
      const tableRows = selectedItems.map((item, index) => [
        (index + 1).toString(),
        item.brandName,
        item.size,
        item.cases.toString(),
        item.bottles.toString(),
        `Rs ${parseFloat(item.invoicePrice || 0).toFixed(2)}`,
        `Rs ${parseFloat(item.amount || 0).toFixed(2)}`
      ]);

      // Use autoTable directly - it should be attached to jsPDF prototype
      autoTable(doc, {
        head: [tableColumns],
        body: tableRows,
        startY: 45,
        theme: 'grid',
        headStyles: {
          fillColor: [102, 126, 234],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 10
        },
        styles: {
          fontSize: 9,
          cellPadding: 4,
          lineColor: [200, 200, 200],
          lineWidth: 0.5
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 15 },
          1: { cellWidth: 65 },
          2: { halign: 'center', cellWidth: 25 },
          3: { halign: 'center', cellWidth: 20 },
          4: { halign: 'center', cellWidth: 20 },
          5: { halign: 'right', cellWidth: 30 },
          6: { halign: 'right', cellWidth: 30 }
        },
        margin: { top: 45, left: 10, right: 10 }
      });

      // Calculate estimate if available
      if (showEstimate) {
        const estimate = calculateEstimate();
        const finalY = doc.lastAutoTable.finalY + 20;
        
        // Estimate Summary Header
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('Estimate Summary', 20, finalY);
        
        const summaryData = [
          ['Invoice Value:', `Rs ${estimate.invoiceValue.toFixed(2)}`],
          ['MRP Rounding Off:', `Rs ${estimate.mrpRoundingOff.toFixed(2)}`],
          ['Net Invoice Value:', `Rs ${estimate.netInvoiceValue.toFixed(2)}`],
          ['Retail Excise Turnover Tax:', `Rs ${estimate.retailExciseTurnoverTax.toFixed(2)}`],
          ['Special Excise Cess:', `Rs ${estimate.specialExciseCess.toFixed(2)}`],
          ['TCS (1.175%):', `Rs ${estimate.tcs.toFixed(2)}`]
        ];
        
        autoTable(doc, {
          head: [['Description', 'Amount']],
          body: summaryData,
          startY: finalY + 10,
          theme: 'grid',
          headStyles: {
            fillColor: [102, 126, 234],
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 11
          },
          styles: {
            fontSize: 10,
            cellPadding: 4,
            lineColor: [200, 200, 200],
            lineWidth: 0.5
          },
          columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 100 },
            1: { halign: 'right', cellWidth: 50, fontStyle: 'bold' }
          },
          margin: { left: 20, right: 20 }
        });
        
        // Grand Total with border
        const grandTotalY = doc.lastAutoTable.finalY + 15;
        
        autoTable(doc, {
          body: [['Grand Total:', `Rs ${estimate.grandTotal.toFixed(2)}`]],
          startY: grandTotalY,
          theme: 'grid',
          headStyles: {
            fillColor: [102, 126, 234]
          },
          styles: {
            fontSize: 14,
            cellPadding: 5,
            fontStyle: 'bold',
            fillColor: [240, 248, 255],
            lineColor: [102, 126, 234],
            lineWidth: 1
          },
          columnStyles: {
            0: { cellWidth: 100 },
            1: { halign: 'right', cellWidth: 50 }
          },
          margin: { left: 20, right: 20 }
        });
      }
      
      // Save the PDF
      const fileName = `indent-estimate-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
    } catch (error) {
      console.error('PDF generation error:', error);
      alert('Error generating PDF. Please try again.');
    }
  };

  return (
    <div className="indent-estimate-container">
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
            <span className="search-icon">🔍</span>
            <h3>Product Search</h3>
          </div>
          <div className="search-input-group">
            <input
              type="text"
              className="search-input"
              placeholder="Search by brand number or brand name..."
              value={searchTerm}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              onFocus={() => {
                if (searchResults.length > 0 && searchTerm.length >= 2) {
                  setShowResults(true);
                }
              }}
            />
            <button 
              className="search-button"
              onClick={() => handleSearch()}
              disabled={loading}
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Search Results */}
          {showResults && (
            <div className="search-results">
              {loading ? (
                <div className="loading-results">
                  <div className="loading-spinner">🔄</div>
                  <span>Searching...</span>
                </div>
              ) : searchResults.length > 0 ? (
                <div className="results-list">
                  {searchResults.map(brand => (
                    <div key={brand.id} className="result-item" onClick={() => addToEstimate(brand)}>
                      <div className="result-info">
                        <span className="brand-number">{brand.brand_number}</span>
                        <span className="brand-name">{brand.brand_name}</span>
                        <span className="pack-type">{brand.pack_type || 'G'}</span>
                        <span className="brand-size">{brand.pack_quantity || 12}/{brand.size_ml}ml</span>
                      </div>
                      <button className="add-button">Add</button>
                    </div>
                  ))}
                </div>
              ) : searchTerm.length >= 2 ? (
                <div className="no-results">No products found for "{searchTerm}"</div>
              ) : (
                <div className="no-results">Type at least 2 characters to search</div>
              )}
            </div>
          )}
        </div>

        {/* Estimation Section */}
        <div className="estimation-section">
          <div className="estimation-header">
            <h3>Estimation</h3>
          </div>

          {selectedItems.length === 0 ? (
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
                  {selectedItems.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1}</td>
                      <td>{item.brandName}</td>
                      <td>{item.size}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={item.cases}
                          onChange={(e) => updateQuantity(item.id, 'cases', e.target.value)}
                          className="quantity-input"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max={item.packQuantity - 1}
                          value={item.bottles}
                          onChange={(e) => updateQuantity(item.id, 'bottles', e.target.value)}
                          className="quantity-input"
                        />
                      </td>
                      <td>₹{parseFloat(item.invoicePrice || 0).toFixed(2)}</td>
                      <td>₹{parseFloat(item.amount || 0).toFixed(2)}</td>
                      <td>
                        <button 
                          className="remove-button"
                          onClick={() => removeItem(item.id)}
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
                  onClick={() => setShowEstimate(true)}
                  disabled={selectedItems.length === 0}
                >
                  📊 Get Estimate
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Estimate Summary Section */}
        {showEstimate && selectedItems.length > 0 && (
          <div className="estimate-summary-section">
            <div className="estimate-summary-header">
              <h3>Estimate Summary</h3>
            </div>
            
            <div className="ten-times-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={tenTimesCompleted}
                  onChange={(e) => setTenTimesCompleted(e.target.checked)}
                />
                10 Times Stock Lifted Completed (10% Retail Excise Turnover Tax)
              </label>
            </div>

            <div className="estimate-calculations">
              {(() => {
                const estimate = calculateEstimate();
                return (
                  <div className="calculation-table">
                    <div className="calculation-row">
                      <span className="calculation-label">Invoice Value:</span>
                      <span className="calculation-value">₹{estimate.invoiceValue.toFixed(2)}</span>
                    </div>
                    <div className="calculation-row">
                      <span className="calculation-label">MRP Rounding Off:</span>
                      <span className="calculation-value">₹{estimate.mrpRoundingOff.toFixed(2)}</span>
                    </div>
                    <div className="calculation-row total-row">
                      <span className="calculation-label">Net Invoice Value:</span>
                      <span className="calculation-value">₹{estimate.netInvoiceValue.toFixed(2)}</span>
                    </div>
                    <div className="calculation-row">
                      <span className="calculation-label">Retail Excise Turnover Tax:</span>
                      <span className="calculation-value">₹{estimate.retailExciseTurnoverTax.toFixed(2)}</span>
                    </div>
                    <div className="calculation-row">
                      <span className="calculation-label">Special Excise Cess:</span>
                      <span className="calculation-value">₹{estimate.specialExciseCess.toFixed(2)}</span>
                    </div>
                    <div className="calculation-row">
                      <span className="calculation-label">TCS (1.175%):</span>
                      <span className="calculation-value">₹{estimate.tcs.toFixed(2)}</span>
                    </div>
                    <div className="calculation-row grand-total-row">
                      <span className="calculation-label">Grand Total:</span>
                      <span className="calculation-value">₹{estimate.grandTotal.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="pdf-action-buttons">
              <button className="download-pdf-button" onClick={generatePDF}>
                📄 Download Indent Estimate (PDF)
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default IndentEstimate;
