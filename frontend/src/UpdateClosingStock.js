import React, { useState, useEffect } from 'react';
import './UpdateClosingStock.css';
import API_BASE_URL from './config';

// Helper function to get business date (day starts at 11:30 AM)
function getBusinessDate() {
  const now = new Date();
  
  // Convert to IST (UTC+5:30) to handle server timezone differences
  const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
  const istTime = new Date(now.getTime() + istOffset);
  
  console.log('Frontend - Browser time:', now.toString());
  console.log('Frontend - IST time:', istTime.toString());
  console.log('Frontend - IST hours:', istTime.getHours(), 'minutes:', istTime.getMinutes());
  
  if (istTime.getHours() < 11 || (istTime.getHours() === 11 && istTime.getMinutes() < 30)) {
    // Before 11:30 AM IST - use previous day
    const yesterday = new Date(istTime);
    yesterday.setDate(yesterday.getDate() - 1);
    const businessDate = yesterday.toLocaleDateString('en-CA');
    console.log('Frontend - Business date (before 11:30 AM):', businessDate);
    return businessDate;
  } else {
    // After 11:30 AM IST - use current day
    const businessDate = istTime.toLocaleDateString('en-CA');
    console.log('Frontend - Business date (after 11:30 AM):', businessDate);
    return businessDate;
  }
}

function UpdateClosingStock({ onNavigate }) {
 const [stockData, setStockData] = useState([]);
 const [filteredData, setFilteredData] = useState([]);
 const [loading, setLoading] = useState(true);
 const [searchTerm, setSearchTerm] = useState('');
 const [saving, setSaving] = useState(false);
 const [editingValues, setEditingValues] = useState({});
 const [closingStockStatus, setClosingStockStatus] = useState(null);
 const [businessDate, setBusinessDate] = useState(null);
 const [originalValues, setOriginalValues] = useState({});

 const user = JSON.parse(localStorage.getItem('user') || '{}');
 const token = localStorage.getItem('token');
 const shopName = user.shopName || 'Liquor Ledger';

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
     const response = await fetch(`${API_BASE_URL}/api/shop/products`, {
       headers: {
         'Authorization': `Bearer ${token}`,
         'Content-Type': 'application/json'
       }
     });

         if (response.ok) {
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
     } else {
       console.error('Failed to fetch stock data');
     }
   } catch (error) {
     console.error('Error fetching stock data:', error);
   }
   setLoading(false);
 };

 const handleClosingStockChange = (id, value) => {
   const numValue = parseInt(value) || 0;
   
   setEditingValues(prev => ({
     ...prev,
     [id]: numValue
   }));

   // Update the displayed data immediately for UX
   const updatedData = filteredData.map(item => {
     if (item.id === id) {
       const newClosingStock = numValue;
       const newSales = Math.max(0, item.total - newClosingStock);
       return {
         ...item,
         closingStock: newClosingStock,
         sales: newSales
       };
     }
     return item;
   });
   
   setFilteredData(updatedData);
   
   // Also update the main stockData
   const updatedStockData = stockData.map(item => {
     if (item.id === id) {
       const newClosingStock = numValue;
       const newSales = Math.max(0, item.total - newClosingStock);
       return {
         ...item,
         closingStock: newClosingStock,
         sales: newSales
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

 const handleSave = async () => {
   setSaving(true);
   try {
     // Use business date instead of regular date
     const targetDate = businessDate || getBusinessDate();
     
     const response = await fetch(`${API_BASE_URL}/api/closing-stock/update`, {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${token}`,
         'Content-Type': 'application/json'
       },
       body: JSON.stringify({
         date: targetDate,
         stockUpdates: stockData.map(item => ({
           id: item.id,
           closingStock: item.closingStock
         }))
       })
     });

         if (response.ok) {
      alert('Closing stock updated successfully!');
      setEditingValues({});
      // Refresh the stock data to update the save status
      fetchTodayStock();
    } else {
      const error = await response.json();
      alert(`Error: ${error.message}`);
    }
   } catch (error) {
     console.error('Error saving closing stock:', error);
     alert('Network error while saving');
   }
   setSaving(false);
 };

 if (loading) {
   return (
     <div className="update-closing-stock-container">
       <div className="loading-container">Loading today's stock...</div>
     </div>
   );
 }

 return (
   <div className="update-closing-stock-container">
     <header className="update-closing-stock-header">
       <div className="update-closing-stock-logo-section">
         <h1 className="update-closing-stock-app-title">{shopName}</h1>
         <p className="update-closing-stock-app-subtitle">Inventory Management</p>
       </div>
       <nav className="update-closing-stock-navigation">
         <button className="update-closing-stock-nav-btn" onClick={() => onNavigate('dashboard')}>Dashboard</button>
         <button className="update-closing-stock-nav-btn" onClick={() => onNavigate('stockOnboarding')}>Stock Onboarding</button>
         <button className="update-closing-stock-nav-btn" onClick={() => onNavigate('manageStock')}>Manage Stock</button>
                   <button className="update-closing-stock-nav-btn" onClick={() => onNavigate('sheets')}>Sheets</button>
          <button className="update-closing-stock-nav-btn">Reports</button>
         <button className="update-closing-stock-nav-btn">Settings</button>
       </nav>
     </header>

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
          {closingStockStatus && (
            <div className="save-status-info">
              {closingStockStatus.savedProducts} of {closingStockStatus.totalProducts} products saved
              {businessDate && <span className="business-date"> • Business Date: {businessDate}</span>}
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
               filteredData.map((item) => (
                 <tr key={item.id}>
                   <td>{item.serialNo}</td>
                   <td className="update-closing-stock-brand-name">{item.brandName}</td>
                   <td>{item.size}</td>
                   <td>{item.openingStock}</td>
                   <td>{item.received}</td>
                   <td>{item.total}</td>
                   <td>
                     <input
                       type="number"
                       className={`update-closing-stock-input ${!item.isClosingStockSet ? 'not-set' : ''}`}
                       value={item.closingStock}
                       onChange={(e) => handleClosingStockChange(item.id, e.target.value)}
                       min="0"
                       max={item.total}
                       placeholder={!item.isClosingStockSet ? `${item.total} (auto)` : ''}
                     />
                   </td>
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
         </table>
       </div>

       
     </main>
   </div>
 );
}

export default UpdateClosingStock;
