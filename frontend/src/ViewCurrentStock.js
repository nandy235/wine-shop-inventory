import React, { useState, useEffect } from 'react';
import './ViewCurrentStock.css';
import API_BASE_URL from './config';

function ViewCurrentStock({ onNavigate }) {
 const [inventory, setInventory] = useState([]);
 const [loading, setLoading] = useState(true);
 const [editingRow, setEditingRow] = useState(null);
 const [editValues, setEditValues] = useState({});
 const [draggedItem, setDraggedItem] = useState(null);
 const [dragOverItem, setDragOverItem] = useState(null);


 const user = JSON.parse(localStorage.getItem('user') || '{}');
 const token = localStorage.getItem('token');
 const shopName = user.shopName || 'test wines';

 useEffect(() => {
   fetchInventory();
 }, []);

 const fetchInventory = async () => {
   try {
     const response = await fetch(`${API_BASE_URL}/api/shop/products`, {
       headers: {
         'Authorization': `Bearer ${token}`,
         'Content-Type': 'application/json'
       }
     });

     if (response.ok) {
       const data = await response.json();
       setInventory(data);
     }
   } catch (error) {
     console.error('Error fetching inventory:', error);
   }
   setLoading(false);
 };

 const getDisplaySize = (item) => {
 // Format as sizeCode(sizeml) - e.g., "NN(180ml)"
 const sizeCode = item.sizeCode || '';
 const size = item.size || '';
 return `${sizeCode}(${size}ml)`;
};

 const getBaseName = (productName) => {
 // Remove size information to get base brand name
 return productName.replace(/\s+(90ml|180ml|375ml|750ml|1000ml|2000ml|60ml|500ml|650ml|330ml|275ml).*$/i, '').trim();
};

const groupedInventory = inventory.reduce((groups, item) => {
 // Group by base brand name (without size)
 const baseName = getBaseName(item.name);
 if (!groups[baseName]) {
   groups[baseName] = [];
 }
 groups[baseName].push(item);
 return groups;
}, {});

// Sort variants by size within each group (descending: largest to smallest)
Object.keys(groupedInventory).forEach(baseName => {
 groupedInventory[baseName].sort((a, b) => {
   const aSize = parseInt(a.size) || 0;
   const bSize = parseInt(b.size) || 0;
   return bSize - aSize;
 });
});



 const handleEdit = (item) => {
   setEditingRow(item.id);
   setEditValues({
     receivedStock: item.receivedStock || 0,
     finalPrice: item.finalPrice || 0
   });
 };

 const handleSave = async (item) => {
   try {
     const response = await fetch(`${API_BASE_URL}/api/shop/update-daily-stock/${item.id}`, {
       method: 'PUT',
       headers: {
         'Authorization': `Bearer ${token}`,
         'Content-Type': 'application/json'
       },
       body: JSON.stringify({
         receivedStock: editValues.receivedStock,
         finalPrice: editValues.finalPrice
       })
     });

     if (response.ok) {
       alert('✅ Product updated successfully!');
       setEditingRow(null);
       fetchInventory();
     } else {
       alert('❌ Error updating product');
     }
   } catch (error) {
     alert('❌ Network error');
   }
 };

 const handleDelete = async (item) => {
   if (window.confirm(`⚠️ DELETE ${item.name}?\n\nThis will COMPLETELY REMOVE the product from:\n• Shop Inventory\n• Daily Stock Records\n\nThis action cannot be undone!`)) {
     try {
       const response = await fetch(`${API_BASE_URL}/api/shop/delete-product/${item.id}`, {
         method: 'DELETE',
         headers: {
           'Authorization': `Bearer ${token}`,
           'Content-Type': 'application/json'
         }
       });

       if (response.ok) {
         alert('✅ Product completely deleted from inventory and stock records!');
         fetchInventory();
       } else {
         const errorData = await response.json();
         alert(`❌ Error deleting product: ${errorData.message}`);
       }
     } catch (error) {
       alert('❌ Network error');
     }
   }
 };

 const handleCancel = () => {
   setEditingRow(null);
   setEditValues({});
 };

 // Drag and drop handlers
 const handleDragStart = (e, brandName) => {
   setDraggedItem(brandName);
   e.dataTransfer.effectAllowed = 'move';
   e.dataTransfer.setData('text/html', e.target.outerHTML);
   e.dataTransfer.setDragImage(e.target, 0, 0);
 };

 const handleDragOver = (e, brandName) => {
   e.preventDefault();
   e.dataTransfer.dropEffect = 'move';
   if (draggedItem !== brandName) {
     setDragOverItem(brandName);
   }
 };

 const handleDragLeave = () => {
   setDragOverItem(null);
 };

 const handleDrop = async (e, targetBrandName) => {
   e.preventDefault();
   
   if (!draggedItem || draggedItem === targetBrandName) {
     setDraggedItem(null);
     setDragOverItem(null);
     return;
   }

   try {
     // Get current order of brand groups
     const brandNames = Object.keys(groupedInventory);
     const currentOrder = [...brandNames];
     
     // Remove dragged item and insert at new position
     const draggedIndex = currentOrder.indexOf(draggedItem);
     const targetIndex = currentOrder.indexOf(targetBrandName);
     
     currentOrder.splice(draggedIndex, 1);
     currentOrder.splice(targetIndex, 0, draggedItem);
     
     // Create sorted brand groups with product IDs
     const sortedBrandGroups = currentOrder.map(brandName => ({
       brandName,
       productIds: groupedInventory[brandName].map(item => item.id)
     }));

     // Send to server
     const response = await fetch(`${API_BASE_URL}/api/shop/update-sort-order`, {
       method: 'PUT',
       headers: {
         'Authorization': `Bearer ${token}`,
         'Content-Type': 'application/json'
       },
       body: JSON.stringify({ sortedBrandGroups })
     });

     if (response.ok) {
       console.log('✅ Sort order updated successfully');
       // Refresh inventory to show new order
       fetchInventory();
     } else {
       console.error('❌ Error updating sort order');
       alert('❌ Error updating sort order');
     }
   } catch (error) {
     console.error('❌ Network error:', error);
     alert('❌ Network error updating sort order');
   }

   setDraggedItem(null);
   setDragOverItem(null);
 };

 if (loading) {
   return <div>Loading...</div>;
 }

 return (
   <div className="view-stock-container">
     <header className="stock-header">
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

     <main className="view-stock-content">
       <div className="page-title-section">
         <h2 className="main-title"> Current Stock </h2>
       </div>

       <div className="table-container">
         <table className="inventory-table">
           <thead>
             <tr>
               <th>S.NO</th>
               <th>Brand Name</th>
               <th>Size</th>
               <th>O.S</th>
               <th>Received</th>
               <th>TTL</th>
               <th>Price</th>
               <th>Actions</th>
             </tr>
           </thead>
           <tbody>
  {Object.entries(groupedInventory).map(([baseName, items], groupIndex) => 
    items.map((item, itemIndex) => {
      // Calculate TTL = Opening Stock + Received
      const ttl = (item.openingStock || 0) + (item.receivedStock || 0);
      
      const isDraggedOver = dragOverItem === baseName;
      const isDragged = draggedItem === baseName;
      
      return (
        <tr 
          key={item.id} 
          className={`${itemIndex === 0 ? 'brand-group-start' : ''} ${isDraggedOver ? 'drag-over' : ''} ${isDragged ? 'dragging' : ''}`}
          draggable={itemIndex === 0}
          onDragStart={itemIndex === 0 ? (e) => handleDragStart(e, baseName) : undefined}
          onDragOver={itemIndex === 0 ? (e) => handleDragOver(e, baseName) : undefined}
          onDragLeave={itemIndex === 0 ? handleDragLeave : undefined}
          onDrop={itemIndex === 0 ? (e) => handleDrop(e, baseName) : undefined}
        >
          {itemIndex === 0 && (
            <>
              <td rowSpan={items.length}>
                <div className="brand-code-cell">
                  <span className="drag-handle" style={{ cursor: 'grab' }}>⋮⋮</span>
                  {groupIndex + 1}
                </div>
              </td>
              <td rowSpan={items.length} className="brand-name-cell">
                {baseName}
              </td>
            </>
          )}
          <td>{getDisplaySize(item)}</td>
          <td>{item.openingStock || 0}</td>
          <td>
            {editingRow === item.id ? (
              <input
                type="number"
                value={editValues.receivedStock}
                onChange={(e) => setEditValues({...editValues, receivedStock: parseInt(e.target.value) || 0})}
                className="edit-input"
                min="0"
              />
            ) : (
              item.receivedStock || 0
            )}
          </td>
          <td>
            {editingRow === item.id ? 
              (item.openingStock || 0) + (editValues.receivedStock || 0) : 
              ttl
            }
          </td>
          <td>
            {editingRow === item.id ? (
              <input
                type="number"
                value={editValues.finalPrice}
                onChange={(e) => setEditValues({...editValues, finalPrice: parseFloat(e.target.value) || 0})}
                className="edit-input"
                step="0.01"
                min="0"
              />
            ) : (
              `₹${item.finalPrice || 0}`
            )}
          </td>
          <td>
            {editingRow === item.id ? (
              <div className="edit-actions">
                <button className="save-btn" onClick={() => handleSave(item)}>Save</button>
                <button className="cancel-btn" onClick={handleCancel}>Cancel</button>
              </div>
            ) : (
              <div className="row-actions">
                <button className="edit-btn" onClick={() => handleEdit(item)}>Edit</button>
                <button className="delete-btn" onClick={() => handleDelete(item)}>Delete</button>
              </div>
            )}
          </td>
        </tr>
      );
    })
  )}
</tbody>
         </table>
       </div>
     </main>
   </div>
 );
}
export default ViewCurrentStock;