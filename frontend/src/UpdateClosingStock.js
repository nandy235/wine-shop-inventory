import React, { useState, useEffect } from 'react';
import './UpdateClosingStock.css';
import { apiGet, apiPost } from './apiUtils';
import { getCurrentUser } from './authUtils';
import Navigation from './components/Navigation';

// Helper function to get business date (day starts at 11:30 AM)
function getBusinessDate() {
  const now = new Date();
  
  // Convert to IST (UTC+5:30) to handle server timezone differences
  const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
  const istTime = new Date(now.getTime() + istOffset);
  
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



function UpdateClosingStock({ onNavigate, onLogout }) {
 const [stockData, setStockData] = useState([]);
 const [filteredData, setFilteredData] = useState([]);
 const [loading, setLoading] = useState(true);
 const [searchTerm, setSearchTerm] = useState('');
 const [saving, setSaving] = useState(false);
 const [saveProgress, setSaveProgress] = useState(0);
 const [saveStatus, setSaveStatus] = useState('');
 const [editingValues, setEditingValues] = useState({});
 const [closingStockStatus, setClosingStockStatus] = useState(null);
 const [businessDate, setBusinessDate] = useState(getBusinessDate());
 const [originalValues, setOriginalValues] = useState({});
 const [retryCount, setRetryCount] = useState(0);

 const user = getCurrentUser();
  // Token no longer needed - apiUtils handles authentication automatically
 const shopName = user.shopName || 'Liquor Ledger';

 const formatBusinessDate = (dateString) => {
   // Format business date as DD-MM-YYYY
   const date = new Date(dateString);
   const day = date.getDate().toString().padStart(2, '0');
   const month = (date.getMonth() + 1).toString().padStart(2, '0');
   const year = date.getFullYear();
   return `${day}-${month}-${year}`;
 };

// Group inventory items by brand name for rowspan display and add pack type indicators
const getGroupedInventoryForDisplay = () => {
  const groups = {};
  const result = [];
  
  // First, identify products that have multiple pack types for the same size code
  const sizeCodePackTypes = {};
  filteredData.forEach(item => {
    const key = `${item.brandName}_${item.size}`;
    if (!sizeCodePackTypes[key]) {
      sizeCodePackTypes[key] = new Set();
    }
    sizeCodePackTypes[key].add(item.packType);
  });
  
  // Group items by brand name
  filteredData.forEach((item, originalIndex) => {
    const brandName = item.brandName;
    if (!groups[brandName]) {
      groups[brandName] = [];
    }
    
    // Determine if we need to show pack type indicator
    const sizeKey = `${item.brandName}_${item.size}`;
    const hasMultiplePackTypes = sizeCodePackTypes[sizeKey].size > 1;
    const displaySize = hasMultiplePackTypes 
      ? `${item.size} (${item.packType})`
      : item.size;
    
    groups[brandName].push({
      ...item,
      displaySize,
      originalIndex
    });
  });
  
  // Convert to display format with rowspan info
  let serialNumber = 1;
  Object.keys(groups).forEach(brandName => {
    const variants = groups[brandName];
    variants.forEach((variant, variantIndex) => {
      result.push({
        ...variant,
        brandName,
        isFirstVariant: variantIndex === 0,
        isLastVariant: variantIndex === variants.length - 1,
        variantCount: variants.length,
        serialNumber: variantIndex === 0 ? serialNumber : null
      });
    });
    serialNumber++;
  });
  
  return result;
};


 useEffect(() => {
   fetchTodayStock();
 }, []);

 useEffect(() => {
   if (searchTerm) {
     const filtered = stockData.filter(item => 
       item.brandName.toLowerCase().includes(searchTerm.toLowerCase()) ||
       item.brandNumber.includes(searchTerm)
     );
     setFilteredData(filtered);
   } else {
     setFilteredData(stockData);
   }
 }, [searchTerm, stockData]);

 const fetchTodayStock = async () => {
   try {
    const response = await apiGet('/api/shop/products');
    const responseData = await response.json();
      
      // Handle both old and new API response formats
      const products = responseData.products || responseData;
      const closingStatus = responseData.closingStockStatus || null;
      const bizDate = responseData.businessDate || null;
      
      const processedData = products.map((item, index) => {
        const openingStock = item.openingStock || 0;
        const receivedStock = item.receivedStock || 0;
        const totalStock = openingStock + receivedStock;
        // If closing_stock is NULL, display total stock but keep track that it's not set
        const closingStock = item.closingStock !== null ? item.closingStock : totalStock;
        const isClosingStockSet = item.closingStock !== null;
        
        return {
          id: item.id,
          serialNo: index + 1,
          brandName: item.name,
          brandNumber: item.brandNumber,
          size: `${item.sizeCode}(${item.size}ml)`,
          packType: item.packType,
          openingStock: openingStock,
          received: receivedStock,
          total: totalStock,
          closingStock: closingStock,
          isClosingStockSet: isClosingStockSet,
          sales: Math.max(0, totalStock - closingStock)
        };
      });

      setStockData(processedData);
      setFilteredData(processedData);
      setClosingStockStatus(closingStatus);
      setBusinessDate(bizDate);
      
      // Store original closing stock values for change tracking
      const originalClosingStocks = {};
      processedData.forEach(item => {
        originalClosingStocks[item.id] = item.closingStock;
      });
      setOriginalValues(originalClosingStocks);
 } catch (error) {
   console.error('Error fetching stock data:', error);
 }
   setLoading(false);
 };

 const handleClosingStockChange = (id, value) => {
  // Handle empty string or invalid input
  let numValue;
  if (value === '' || value === null || value === undefined) {
    numValue = 0;
  } else {
    numValue = parseInt(value);
    if (isNaN(numValue) || numValue < 0) {
      numValue = 0;
    }
  }
  
  // Find the item to get its total (TTL) value
  const currentItem = stockData.find(item => item.id === id);
  if (!currentItem) return;
  
  // Prevent closing stock from exceeding total available stock
  const validatedValue = Math.min(numValue, currentItem.total);
  
  setEditingValues(prev => ({
    ...prev,
    [id]: validatedValue
  }));

  // Update the displayed data immediately for UX
  const updatedData = filteredData.map(item => {
    if (item.id === id) {
      const newClosingStock = validatedValue;
      const newSales = Math.max(0, item.total - newClosingStock);
      return {
        ...item,
        closingStock: newClosingStock,
        sales: newSales,
        isClosingStockSet: true // Mark as manually set
      };
    }
    return item;
  });
  
  setFilteredData(updatedData);
  
  // Also update the main stockData
  const updatedStockData = stockData.map(item => {
    if (item.id === id) {
      const newClosingStock = validatedValue;
      const newSales = Math.max(0, item.total - newClosingStock);
      return {
        ...item,
        closingStock: newClosingStock,
        sales: newSales,
        isClosingStockSet: true // Mark as manually set
      };
    }
    return item;
  });
  
  setStockData(updatedStockData);
};

 // Helper function to check if there are unsaved changes
 const hasUnsavedChanges = () => {
   return stockData.some(item => {
     const currentValue = item.closingStock;
     const originalValue = originalValues[item.id];
     return currentValue !== originalValue;
   });
 };

 // Helper function to get button CSS class
 const getButtonClass = () => {
   if (hasUnsavedChanges()) {
     return 'has-changes';
   } else if (closingStockStatus?.isFullySaved) {
     return 'already-saved';
   }
   return '';
 };

 // Helper function to get button text
 const getButtonText = () => {
   if (saving) {
     return 'Saving...';
   } else if (hasUnsavedChanges()) {
     return 'Save Changes';
   } else if (closingStockStatus?.isFullySaved) {
     return 'Already Saved ✓';
   } else if (closingStockStatus?.isPartiallySaved) {
     return 'Save Remaining Changes';
   } else {
     return 'Save All Changes';
   }
 };

 const handleSaveWithRetry = async (attemptCount = 0) => {
   const maxRetries = 2;
   setSaving(true);
   setSaveProgress(0);
   setSaveStatus('Preparing to save...');
   setRetryCount(attemptCount);
   
   try {
     // Use business date instead of regular date
     const targetDate = businessDate || getBusinessDate();
     const stockUpdates = stockData.map(item => ({
       id: item.id,
       closingStock: item.closingStock
     }));
     
     setSaveStatus(`Saving ${stockUpdates.length} products...`);
     setSaveProgress(25);
     
     const response = await apiPost('/api/closing-stock/update', {
       date: targetDate,
       stockUpdates: stockUpdates
     });

     setSaveProgress(75);
     setSaveStatus('Processing response...');

     if (response.ok) {
       const result = await response.json();
       setSaveProgress(100);
       setSaveStatus('Save completed successfully!');
       
       // Enhanced success message with batch processing details
       const successMessage = result.performance?.batchProcessing 
         ? `✅ Closing stock updated successfully!\n\n📊 Batch Processing Results:\n• ${result.updatedCount} total records processed\n• ${result.existingUpdated || 0} existing records updated\n• ${result.newRecordsCreated || 0} new records created\n\n⚡ Performance: Optimized batch operation`
         : `✅ Closing stock updated successfully!\n${result.updatedCount} products updated`;
       
       alert(successMessage);
       setEditingValues({});
       setRetryCount(0);
       
       // Refresh the stock data to update the save status
       setTimeout(() => {
         setSaveStatus('');
         setSaveProgress(0);
         fetchTodayStock();
       }, 1500);
     } else {
       const error = await response.json();
       throw new Error(error.message || 'Server error occurred');
     }
   } catch (error) {
     console.error('Error saving closing stock:', error);
     setSaveProgress(0);
     
     // Enhanced error handling with retry logic
     if (attemptCount < maxRetries && (
       error.message.includes('timeout') || 
       error.message.includes('network') ||
       error.message.includes('connection')
     )) {
       setSaveStatus(`Save failed, retrying... (${attemptCount + 1}/${maxRetries + 1})`);
       console.log(`🔄 Retrying save attempt ${attemptCount + 1}/${maxRetries + 1}...`);
       
       // Wait before retry with exponential backoff
       const retryDelay = Math.min(2000 * Math.pow(2, attemptCount), 8000);
       setTimeout(() => {
         handleSaveWithRetry(attemptCount + 1);
       }, retryDelay);
       return;
     }
     
     // Final failure
     setSaveStatus('Save failed');
     setRetryCount(0);
     
     let errorMessage = 'Network error while saving';
     if (error.message.includes('timeout')) {
       errorMessage = '⏱️ Save operation timed out.\n\nThis might be due to a large number of products. The save might still be processing in the background.\n\nPlease wait a moment and refresh the page to check if your changes were saved.';
     } else if (error.message.includes('batch')) {
       errorMessage = `❌ Batch processing error: ${error.message}\n\nPlease try again or contact support if the issue persists.`;
     } else {
       errorMessage = `❌ Error: ${error.message}`;
     }
     
     alert(errorMessage);
     
     setTimeout(() => {
       setSaveStatus('');
     }, 3000);
   }
   setSaving(false);
 };

 // Wrapper function for backward compatibility
 const handleSave = () => handleSaveWithRetry(0);

 if (loading) {
   return (
     <div className="update-closing-stock-container">
       <div className="loading-container">Loading today's stock...</div>
     </div>
   );
 }

return (
  <div className="update-closing-stock-container">
    <Navigation 
      currentPage="updateClosingStock"
      onNavigate={onNavigate}
      onLogout={onLogout}
      shopName={shopName}
    />

     <main className="update-closing-stock-content">
       <div className="update-closing-stock-page-title-section">
         <h2 className="update-closing-stock-main-title">Update Closing Stock</h2>
         <p className="update-closing-stock-subtitle">Update end-of-day closing stock quantities</p>
       </div>

       <div className="update-closing-stock-controls">
        <div className="update-closing-stock-search-box">
          <input
            type="text"
            className="update-closing-stock-search-input"
            placeholder="Search by brand name or number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
         
                 <div className="update-closing-stock-save-section">
          <button 
            className={`update-closing-stock-save-btn ${getButtonClass()}`}
            onClick={handleSave}
            disabled={saving}
          >
            {getButtonText()}
          </button>
          {/* Progress indicator for save operations */}
          {saving && (
            <div className="save-progress-container">
              <div className="save-progress-bar">
                <div 
                  className="save-progress-fill" 
                  style={{ width: `${saveProgress}%` }}
                ></div>
              </div>
              <div className="save-progress-text">
                {saveStatus}
                {retryCount > 0 && <span className="retry-indicator"> (Retry {retryCount}/3)</span>}
              </div>
            </div>
          )}
          
          {closingStockStatus && (
            <div className="save-status-info">
              {closingStockStatus.savedProducts} of {closingStockStatus.totalProducts} products saved
              {businessDate && <span className="business-date"> • <strong>Business Date: {formatBusinessDate(businessDate)}</strong></span>}
              {hasUnsavedChanges() && <span className="changes-indicator"> • Unsaved changes detected</span>}
            </div>
          )}
        </div>
       </div>

       <div className="update-closing-stock-table-container">
         <table className="update-closing-stock-table">
           <thead>
             <tr>
               <th>S.No</th>
               <th>Brand Name</th>
               <th>Size</th>
               <th>O.S</th>
               <th>Rec</th>
               <th>Ttl</th>
               <th>C.S</th>
               <th>Sales</th>
             </tr>
           </thead>
           <tbody>
             {filteredData.length > 0 ? (
               getGroupedInventoryForDisplay().map((item) => (
                 <tr key={item.id}>
                   {/* Serial Number - only show for first variant of each brand */}
                   {item.isFirstVariant && (
                     <td 
                       className="grouped-serial" 
                       rowSpan={item.variantCount}
                     >
                       {item.serialNumber}
                     </td>
                   )}
                   
                   {/* Brand Name - only show for first variant of each brand */}
                   {item.isFirstVariant && (
                     <td 
                       className="update-closing-stock-brand-name grouped-brand-cell" 
                       rowSpan={item.variantCount}
                     >
                       {item.brandName}
                     </td>
                   )}
                   
                   {/* Size - individual for each variant */}
                   <td>{item.displaySize}</td>
                   
                   {/* Opening Stock - individual for each variant */}
                   <td>{item.openingStock}</td>
                   
                   {/* Received - individual for each variant */}
                   <td>{item.received}</td>
                   
                   {/* Total - individual for each variant */}
                   <td>{item.total}</td>
                   
                   {/* Closing Stock Input - individual for each variant */}
                   <td>
                     <input
                       type="number"
                       className={`update-closing-stock-input zero-ph ${!item.isClosingStockSet ? 'not-set' : ''}`}
                       value={item.closingStock}
                       onChange={(e) => handleClosingStockChange(item.id, e.target.value)}
                       onWheel={(e) => e.target.blur()}
                       onFocus={(e) => e.target.select()}
                       min="0"
                       max={item.total}
                       placeholder={!item.isClosingStockSet ? `${item.total} (auto)` : '0'}
                     />
                   </td>
                   
                   {/* Sales - individual for each variant */}
                   <td className="update-closing-stock-sales">{item.sales}</td>
                 </tr>
               ))
             ) : (
               <tr>
                 <td colSpan="8" className="update-closing-stock-no-data">
                   {searchTerm ? 'No products found matching your search' : 'No stock data available'}
                 </td>
               </tr>
             )}
           </tbody>
           <tfoot>
             <tr className="totals-row">
               <td colSpan="3" className="totals-label">TOTAL</td>
               <td className="totals-value">{filteredData.reduce((sum, item) => sum + item.openingStock, 0)}</td>
               <td className="totals-value">{filteredData.reduce((sum, item) => sum + item.received, 0)}</td>
               <td className="totals-value">{filteredData.reduce((sum, item) => sum + item.total, 0)}</td>
               <td className="totals-value">{filteredData.reduce((sum, item) => sum + item.closingStock, 0)}</td>
               <td className="totals-value">{filteredData.reduce((sum, item) => sum + item.sales, 0)}</td>
             </tr>
           </tfoot>
         </table>
       </div>

       
     </main>
   </div>
 );
}

export default UpdateClosingStock;
