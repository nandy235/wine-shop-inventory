import React, { useState, useEffect } from 'react';
import './ViewCurrentStock.css';
import API_BASE_URL from './config';

function ViewCurrentStock({ onNavigate }) {
 const [inventory, setInventory] = useState([]);
 const [loading, setLoading] = useState(true);
 const [editingRow, setEditingRow] = useState(null);
 const [editValues, setEditValues] = useState({});
 const [draggedBrand, setDraggedBrand] = useState(null);
 const [brandOrder, setBrandOrder] = useState([]);

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
  // Format as sizeCode(size) - e.g., "NN(180ml)"
  const sizeCode = item.sizeCode || '';
  const size = item.size || '';
  return `${sizeCode}(${size})`;
 };

 const getBaseName = (productName) => {
  return productName.replace(/\s+(90ml|180ml|375ml|750ml|1000ml|2000ml|60ml|500ml|650ml|330ml|275ml).*$/i, '').trim();
 };

 const groupedInventory = inventory.reduce((groups, item) => {
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

 const handleDragStart = (e, brandKey) => {
   setDraggedBrand(brandKey);
   e.dataTransfer.effectAllowed = 'move';
 };

 const handleDragOver = (e) => {
   e.preventDefault();
   e.dataTransfer.dropEffect = 'move';
 };

 const handleDrop = async (e, targetBrandKey) => {
   e.preventDefault();
   
   if (draggedBrand && draggedBrand !== targetBrandKey) {
     const brandKeys = Object.keys(groupedInventory);
     const draggedIndex = brandKeys.indexOf(draggedBrand);
     const targetIndex = brandKeys.indexOf(targetBrandKey);
     
     const newOrder = [...brandKeys];
     newOrder.splice(draggedIndex, 1);
     newOrder.splice(targetIndex, 0, draggedBrand);
     
     const sortedBrandNumbers = newOrder.map(key => {
       const brandNumber = key.split('-')[0];
       return brandNumber;
     });
     
     try {
       const response = await fetch(`${API_BASE_URL}/api/shop/update-sort-order`, {
         method: 'PUT',
         headers: {
           'Authorization': `Bearer ${token}`,
           'Content-Type': 'application/json'
         },
         body: JSON.stringify({
           sortedBrandGroups: sortedBrandNumbers
         })
       });

       if (response.ok) {
         fetchInventory();
       }
     } catch (error) {
       console.error('Error updating sort order:', error);
     }
   }
   
   setDraggedBrand(null);
 };

 const handleEdit = (item) => {
   setEditingRow(item.id);
   setEditValues({
     quantity: item.quantity,
     finalPrice: item.finalPrice
   });
 };

 const handleSave = async (item) => {
   try {
     const response = await fetch(`${API_BASE_URL}/api/shop/update-product/${item.id}`, {
       method: 'PUT',
       headers: {
         'Authorization': `Bearer ${token}`,
         'Content-Type': 'application/json'
       },
       body: JSON.stringify({
         quantity: editValues.quantity,
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
   if (window.confirm(`Delete ${item.name}?`)) {
     try {
       const response = await fetch(`${API_BASE_URL}/api/shop/delete-product/${item.id}`, {
         method: 'DELETE',
         headers: {
           'Authorization': `Bearer ${token}`,
           'Content-Type': 'application/json'
         }
       });

       if (response.ok) {
         alert('✅ Product deleted successfully!');
         fetchInventory();
       } else {
         alert('❌ Error deleting product');
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
         <h2 className="main-title"> Received Stock </h2>
       </div>

       <div className="table-container">
         <table className="inventory-table">
           <thead>
             <tr>
               <th>Brand Code</th>
               <th>Brand Name</th>
               <th>Size </th>
               <th>Quantity (Bottles)</th>
               <th>Price/Bottle</th>
               <th>Actions</th>
             </tr>
           </thead>
           <tbody>
  {Object.entries(groupedInventory).map(([baseName, items]) => 
    items.map((item, itemIndex) => (
     <tr key={item.id} className={itemIndex === 0 ? 'brand-group-start' : ''}>
        {itemIndex === 0 && (
          <>
            <td rowSpan={items.length}>
              <div className="brand-code-cell">
                <span className="drag-handle">⋮⋮</span>
                {item.brandNumber || 'N/A'}
              </div>
            </td>
            <td rowSpan={items.length} className="brand-name-cell">
              {baseName}
            </td>
          </>
        )}
        <td>{getDisplaySize(item)}</td>
        <td>
          {editingRow === item.id ? (
            <input
              type="number"
              value={editValues.quantity}
              onChange={(e) => setEditValues({...editValues, quantity: parseInt(e.target.value) || 0})}
              className="edit-input"
            />
          ) : (
            item.quantity
          )}
        </td>
        <td>
          {editingRow === item.id ? (
            <input
              type="number"
              value={editValues.finalPrice}
              onChange={(e) => setEditValues({...editValues, finalPrice: parseFloat(e.target.value) || 0})}
              className="edit-input"
              step="0.01"
            />
          ) : (
            `₹${item.finalPrice}`
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
    ))
  )}
</tbody>
         </table>
       </div>
     </main>
   </div>
 );
}
export default ViewCurrentStock;