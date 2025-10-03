import React, { useState, useEffect, useRef } from 'react';
import './StockOnboarding.css';
import { useUserContext } from './contexts/UserContext';
import { apiGet, apiPost, apiPut } from './apiUtils';
import { getCurrentUser } from './authUtils';
import Navigation from './components/Navigation';

function StockOnboarding({ onNavigate, onLogout, isAuthenticated }) {
  const [masterBrands, setMasterBrands] = useState([]);
  const [shopInventory, setShopInventory] = useState([]);
  const [filteredBrands, setFilteredBrands] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [saving, setSaving] = useState(false);
  // Removed drag and drop state - using up arrow buttons instead
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedItems, setEditedItems] = useState({});
  const searchContainerRef = useRef(null);
  // Removed inventory table ref - no longer needed without drag and drop

  // Get user data from server when needed, with authUtils fallback
  const { user, loading: userLoading, error: userError, shopName: contextShopName } = useUserContext();
  const fallbackUser = getCurrentUser();
  const shopName = contextShopName || fallbackUser.shopName || 'Liquor Ledger';

  // Helper function to get business date (day starts at 11:30 AM IST)
  const getBusinessDate = () => {
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
    
    let businessDate;
    if (istTime.getHours() < 11 || (istTime.getHours() === 11 && istTime.getMinutes() < 30)) {
      // Before 11:30 AM IST - use previous day
      const yesterday = new Date(istTime);
      yesterday.setDate(yesterday.getDate() - 1);
      businessDate = yesterday;
    } else {
      // After 11:30 AM IST - use current day
      businessDate = istTime;
    }
    
    // Format date as DD-MM-YYYY
    const day = String(businessDate.getDate()).padStart(2, '0');
    const month = String(businessDate.getMonth() + 1).padStart(2, '0');
    const year = businessDate.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const businessDate = getBusinessDate();

  useEffect(() => {
    fetchMasterBrands();
    fetchShopInventory();
  }, []);

  // Smart refresh - only when user returns to the page
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // User returned to the page, refresh inventory
        fetchShopInventory();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchMasterBrands = async () => {
    try {
      // Fetch all master brands without pack type filter
      const response = await apiGet('/api/master-brands');
      const brands = await response.json();
        
        // Debug: Check pack types distribution
        const packTypeStats = brands.reduce((stats, brand) => {
          stats[brand.packType] = (stats[brand.packType] || 0) + 1;
          return stats;
        }, {});
        
        // Debug: Find brands with both P and G pack types
        const brandGroups = brands.reduce((groups, brand) => {
          const key = `${brand.brandNumber}_${brand.sizeCode}`;
          if (!groups[key]) {
            groups[key] = { name: brand.name, packTypes: [] };
          }
          if (!groups[key].packTypes.includes(brand.packType)) {
            groups[key].packTypes.push(brand.packType);
          }
          return groups;
        }, {});
        
        const brandsWithMultiplePackTypes = Object.values(brandGroups).filter(group => group.packTypes.length > 1);
        setMasterBrands(brands);
    } catch (error) {
      console.error('Error fetching master brands:', error);
    }
    setLoading(false);
  };

  const fetchShopInventory = async () => {
    try {
      const response = await apiGet('/api/shop/products');
      const data = await response.json();
      const products = data.products || [];
      setShopInventory(products);
    } catch (error) {
      console.error('Error fetching shop inventory:', error);
    }
  };




  const handleSearchChange = (value) => {
    setSearchTerm(value);
    if (value.trim() === '') {
      setFilteredBrands([]);
      setShowSearchResults(false);
    } else {
      const searchTerm = value.toLowerCase();
      
      // First filter by search criteria
      const searchFiltered = masterBrands.filter(brand => {
        const matches = 
          brand.name.toLowerCase().includes(searchTerm) ||
          brand.brandNumber.toLowerCase().includes(searchTerm) ||
          brand.sizeCode.toLowerCase().includes(searchTerm) ||
          brand.brandKind?.toLowerCase().includes(searchTerm) ||
          brand.productType.toLowerCase().includes(searchTerm) ||
          brand.size.toString().includes(value) ||
          brand.packQuantity.toString().includes(value) ||
          // Additional fuzzy matching for common search terms
          (searchTerm.includes('mansion') && brand.name.toLowerCase().includes('mansion')) ||
          (searchTerm.includes('brandy') && brand.brandKind?.toLowerCase().includes('brandy')) ||
          (searchTerm.includes('96') && (brand.size === 96 || brand.sizeCode?.includes('96')));
        
        return matches;
      });
      
      // Filter out products that have opening stock > 0 (already onboarded)
      const filtered = searchFiltered.filter(brand => {
        // Check if this brand exists in shop inventory (by master_brand_id)
        const inventoryItem = shopInventory.find(inventoryItem => 
          inventoryItem.master_brand_id === brand.id
        );
        
        const hasOpeningStock = inventoryItem?.openingStock > 0;
        
        return !hasOpeningStock; // Show products with no opening stock or not in inventory
      });
      
      setFilteredBrands(filtered);
      setShowSearchResults(true);
    }
  };

  const handleProductSelect = (product) => {
    // Check if this exact product already exists (same master brand ID)
    const exists = selectedProducts.find(p => p.id === product.id);
    if (!exists) {
      const newProduct = {
        ...product,
        quantity: 0,
        markup: 0
      };
      setSelectedProducts([...selectedProducts, newProduct]);
    }
    // Don't close search results or clear search term - keep it open for more additions
  };

  const handleQuantityChange = (productId, value) => {
    setSelectedProducts(products =>
      products.map(p =>
        p.id === productId ? { ...p, quantity: parseInt(value) || 0 } : p
      )
    );
  };

  const handleMarkupChange = (productId, value) => {
    setSelectedProducts(products =>
      products.map(p =>
        p.id === productId ? { ...p, markup: parseFloat(value) || 0 } : p
      )
    );
  };

  const removeProduct = (productId) => {
    setSelectedProducts(products => products.filter(p => p.id !== productId));
  };

  // Edit mode functions
  const toggleEditMode = () => {
    if (isEditMode) {
      // Exiting edit mode - reset edited items
      setEditedItems({});
    }
    setIsEditMode(!isEditMode);
  };

  // Removed quantity editing - only allow markup editing
  // const handleEditQuantityChange = (itemId, value) => {
  //   setEditedItems(prev => ({
  //     ...prev,
  //     [itemId]: {
  //       ...prev[itemId],
  //       quantity: parseInt(value) || 0
  //     }
  //   }));
  // };

  const handleEditMarkupChange = (itemId, value) => {
    setEditedItems(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        markup: value === '' ? '' : (parseFloat(value) || 0)
      }
    }));
  };

  const saveEditedItems = async () => {
    const itemsToUpdate = Object.keys(editedItems).filter(itemId => 
      editedItems[itemId].markup !== undefined
    );

    if (itemsToUpdate.length === 0) {
      alert('No price changes to save');
      return;
    }

    setSaving(true);
    try {
      const updates = itemsToUpdate.map(itemId => {
        const item = shopInventory.find(inv => inv.id === parseInt(itemId));
        const edits = editedItems[itemId];
        return {
          shopInventoryId: parseInt(itemId),
          markup: edits.markup !== undefined ? (edits.markup === '' ? 0 : parseFloat(edits.markup)) : (item.markup_price || 0)
        };
      });

      const response = await apiPost('/api/shop/inventory/price-update', {
        updates: updates
      });

      if (response.ok) {
        const result = await response.json();
        alert('✅ Prices updated successfully!');
        setIsEditMode(false);
        setEditedItems({});
        // Add a small delay to ensure database transaction is committed
        await new Promise(resolve => setTimeout(resolve, 500));
        await fetchShopInventory(); // Refresh inventory
      } else {
        const error = await response.json();
        console.error('❌ Backend error:', error);
        alert(`❌ Error: ${error.message || 'Failed to update prices'}`);
      }
    } catch (error) {
      console.error('Error updating prices:', error);
      alert(`❌ Error: ${error.message || 'Network error during price update'}`);
    }
    setSaving(false);
  };

  const cancelEdit = () => {
    setEditedItems({});
    setIsEditMode(false);
  };

  const handleSaveStockOnboarding = async () => {
    if (selectedProducts.length === 0) {
      alert('Please select at least one product to onboard');
      return;
    }

    // Validate all products have quantity >= 0 (allow 0 for markup-only updates)
    const invalidProducts = selectedProducts.filter(p => p.quantity < 0 || isNaN(p.quantity));
    if (invalidProducts.length > 0) {
      alert('Please enter a valid quantity (0 or greater) for all products');
      return;
    }

    setSaving(true);
    try {
      const businessDateDisplay = getBusinessDate();
      // Convert DD-MM-YYYY to YYYY-MM-DD for API
      const businessDateForAPI = businessDateDisplay.split('-').reverse().join('-');

      const response = await apiPost('/api/stock-onboarding/save', {
        products: selectedProducts,
        businessDate: businessDateForAPI
      });

      if (response.ok) {
        const result = await response.json();
        
        let message = `✅ Stock onboarding completed!\n\n`;
        message += `✅ Products added: ${result.results.inventoryUpdated}\n`;
        message += `✅ Opening stock updated: ${result.results.openingStockUpdated}\n`;
        
        alert(message);
        
        // Reset form
        setSelectedProducts([]);
        setSearchTerm('');
        setShowSearchResults(false);
        
        // Refresh shop inventory to update search results
        await fetchShopInventory();
        
        // Scroll to top of the page to show updated inventory
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.message || 'Server error during stock onboarding'}`);
      }
    } catch (error) {
      console.error('Error saving stock onboarding:', error);
      alert(`❌ Error: ${error.message || 'Network error during stock onboarding'}`);
    }
    setSaving(false);
  };

  // Helper function to format numbers with commas
  const formatNumber = (num) => {
    return num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Helper function to get markup value safely (handles empty strings)
  const getMarkupValue = (itemId, fallbackValue = 0) => {
    const editedMarkup = editedItems[itemId]?.markup;
    if (editedMarkup !== undefined) {
      return editedMarkup === '' ? 0 : parseFloat(editedMarkup) || 0;
    }
    return parseFloat(fallbackValue) || 0;
  };

  // Helper function to group inventory items by brand name (aggregated display)
  const groupInventoryByBrand = (inventory) => {
    const grouped = {};
    let serialCounter = 1;
    
    inventory.forEach((item) => {
      const brandKey = item.name; // Group by brand name only (aggregated)
      if (!grouped[brandKey]) {
        grouped[brandKey] = {
          brandName: item.name,
          brandNumber: item.brandNumber,
          packTypes: [], // Track all pack types for this brand
          items: [],
          serialNumber: serialCounter++
        };
      }
      
      // Add pack types from the aggregated item (which contains packTypes array)
      if (item.packTypes && Array.isArray(item.packTypes)) {
        item.packTypes.forEach(packType => {
          if (!grouped[brandKey].packTypes.includes(packType)) {
            grouped[brandKey].packTypes.push(packType);
          }
        });
      }
      
      grouped[brandKey].items.push(item);
    });
    
    // Sort items within each brand group by size (ml) in descending order
    Object.values(grouped).forEach(brandGroup => {
      brandGroup.items.sort((a, b) => {
        const sizeA = parseFloat(a.size) || 0;
        const sizeB = parseFloat(b.size) || 0;
        return sizeB - sizeA; // Descending order (largest first)
      });
    });
    
    return Object.values(grouped);
  };

  // Removed drag and drop auto-scroll functions - no longer needed with up arrow buttons

  // Move item to top function
  const moveToTop = (itemId) => {
    const currentInventory = [...(shopInventory || [])];
    const itemIndex = currentInventory.findIndex(item => item.id === itemId);
    
    if (itemIndex === -1) {
      return;
    }
    
    if (itemIndex === 0) {
      return;
    }
    
    // Remove item from current position
    const [movedItem] = currentInventory.splice(itemIndex, 1);
    
    // Add item to the beginning
    currentInventory.unshift(movedItem);
    
    setShopInventory(currentInventory);
    
    // Save the new sort order to the backend
    saveSortOrder(currentInventory);
  };

  // Save sort order to backend
  const saveSortOrder = async (inventory) => {
    try {
      // Group inventory by brand and create the sorted brand groups structure
      const brandGroups = groupInventoryByBrand(inventory);
      
      const sortedBrandGroups = brandGroups.map((brandGroup, groupIndex) => ({
        brandName: brandGroup.brandName,
        productIds: brandGroup.items.map(item => item.id),
        groupOrder: groupIndex + 1
      }));

      // Use apiPut with extended timeout (handled in apiUtils)
      const response = await apiPut('/api/shop/update-sort-order', {
        sortedBrandGroups: sortedBrandGroups
      });

      if (response.ok) {
        const result = await response.json();
        
        // Refresh inventory to reflect the new sort order from database
        await fetchShopInventory();
      } else {
        const error = await response.json();
        // Don't show alert for sort order errors to avoid disrupting UX
      }
    } catch (error) {
      // Don't show alert for sort order errors to avoid disrupting UX
    }
  };

  // Removed all drag and drop functionality - replaced with up arrow buttons

  // Prevent number input values from changing on scroll and arrow keys
  const handleInputEvents = (e) => {
    if (e.type === 'wheel') {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    if (e.type === 'keydown' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  };

  // Add event listeners to prevent wheel and arrow key changes
  useEffect(() => {
    const inputs = document.querySelectorAll('.quantity-input, .markup-input, .edit-markup-input');
    
    const preventWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
    
    const preventArrowKeys = (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    inputs.forEach(input => {
      input.addEventListener('wheel', preventWheel, { passive: false });
      input.addEventListener('keydown', preventArrowKeys, { passive: false });
    });

    return () => {
      inputs.forEach(input => {
        input.removeEventListener('wheel', preventWheel);
        input.removeEventListener('keydown', preventArrowKeys);
      });
    };
  }, [selectedProducts, shopInventory, isEditMode]);

  // Removed drag and drop cleanup useEffects - no longer needed

  return (
    <div className="stock-onboarding-container">
      <Navigation 
        currentPage="stockOnboarding"
        onNavigate={onNavigate}
        onLogout={onLogout}
        shopName={shopName}
      />
      
      <main className="stock-content">
        <div className="page-title-section">
          <div className="title-left">
            <h2 className="main-title">Stock Onboarding</h2>
            <p className="subtitle">Add new products to your inventory with initial stock quantities</p>
          </div>
          <div className="business-date-section">
            <div className="business-date">
              <span className="date-label">Business Date:</span>
              <span className="date-value">{businessDate}</span>
            </div>
          </div>
        </div>
        
        <div className="search-section">
          <h3 className="section-title">Search Products</h3>
          <div className="search-box" ref={searchContainerRef}>
            <div className="search-icon">🔍</div>
            <input
              type="text"
              className="search-field"
              placeholder="Search by brand name, number, or size code..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => {
                // Show search results if there's a search term and results exist
                if (searchTerm.trim() !== '' && filteredBrands.length > 0) {
                  setShowSearchResults(true);
                }
              }}
            />
            
            {showSearchResults && (
              <div className="search-results">
                {filteredBrands.map(brand => {
                  const isAlreadyAdded = selectedProducts.some(p => p.id === brand.id);
                  return (
                    <div 
                      key={brand.id} 
                      className="search-result-item"
                    >
                      <span className="brand-name">#{brand.brandNumber} | {brand.name} | {brand.packType} | {brand.packQuantity} × {brand.size}ml | ₹{brand.mrp}</span>
                      <button 
                        className={`add-product-btn ${isAlreadyAdded ? 'added' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleProductSelect(brand);
                        }}
                        disabled={isAlreadyAdded}
                      >
                        {isAlreadyAdded ? 'Added' : 'Add'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="products-section">
          {/* Current shop inventory */}
          <div className="inventory-display-section">
            <div className="inventory-header">
              <div className="inventory-title-section">
                <h3 className="section-title">Current Shop Inventory ({shopInventory?.length || 0})</h3>
                <p className="inventory-subtitle">Products currently in your inventory</p>
              </div>
              <div className="inventory-controls">
                {!isEditMode ? (
                  <div className="inventory-stats">
                    <div className="inventory-value">
                      <div className="value-label">Total Quantities</div>
                      <div className="value-amount">{shopInventory?.reduce((sum, item) => sum + item.quantity, 0) || 0}</div>
                    </div>
                    <div className="inventory-value">
                      <div className="value-label">Total Stock Value</div>
                      <div className="value-amount">₹{formatNumber(shopInventory?.reduce((sum, item) => sum + parseFloat(item.mrp) * item.quantity, 0) || 0)}</div>
                    </div>
                    <button 
                      className="edit-inventory-btn"
                      onClick={toggleEditMode}
                      disabled={!shopInventory || shopInventory.length === 0}
                    >
                      💰 Edit Prices
                    </button>
                  </div>
                ) : (
                  <div className="edit-mode-controls">
                    <div className="edit-mode-info">
                      <span className="edit-mode-label">💰 Price Edit Mode</span>
                      <span className="edit-mode-subtitle">Click on markup values to edit prices</span>
                    </div>
                    <div className="edit-action-buttons">
                      <button 
                        className="save-edit-btn"
                        onClick={saveEditedItems}
                        disabled={saving || Object.keys(editedItems).length === 0}
                      >
                        {saving ? 'Saving...' : '✅ Save Prices'}
                      </button>
                      <button 
                        className="cancel-edit-btn"
                        onClick={cancelEdit}
                        disabled={saving}
                      >
                        ❌ Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {!shopInventory || shopInventory.length === 0 ? (
              <div className="empty-state-box">
                <div className="empty-icon">📋</div>
                <h4 className="empty-title">No products in inventory</h4>
                <p className="empty-message">Use the search above to find and add products to your inventory</p>
              </div>
            ) : (
              <div className="inventory-table">
                <table>
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Brand Details</th>
                      <th>Pack Info</th>
                      <th>MRP</th>
                      <th>Markup</th>
                      <th>
                        <div className="price-header">
                          <div>FINAL PRICE</div>
                          <div className="price-subtitle">(MRP + MARKUP)</div>
                        </div>
                      </th>
                      <th>Current Stock</th>
                      <th>Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupInventoryByBrand(shopInventory || []).map((brandGroup) => 
                      brandGroup.items.map((item, itemIndex) => {
                        const actualIndex = (shopInventory || []).findIndex(inv => inv.id === item.id);
                        return (
                          <tr 
                            key={item.id}
                            className={`inventory-row ${itemIndex === brandGroup.items.length - 1 ? 'brand-group-end' : ''}`}
                          >
                            {itemIndex === 0 && (
                              <>
                                <td className="grouped-serial" rowSpan={brandGroup.items.length}>
                                  <div className="move-controls-container">
                                    <span className="serial-number">{brandGroup.serialNumber}</span>
                                    <button 
                                      className="move-to-top-btn" 
                                      title="Move to top"
                                      onClick={() => moveToTop(brandGroup.items[0].id)}
                                    >
                                      ↑
                                    </button>
                                  </div>
                                </td>
                                <td className="grouped-brand-cell" rowSpan={brandGroup.items.length}>
                                  <div className="brand-details">
                                    <div className="brand-name">{brandGroup.brandName}</div>
                                    <div className="brand-number">#{brandGroup.brandNumber}</div>
                                  </div>
                                </td>
                              </>
                            )}
                            <td className="variant-size-cell">
                              <div className="pack-info">
                                <div className="pack-size">{item.pack_quantity} × {item.size}ml</div>
                                <div className="pack-type">Type: {item.packType}</div>
                              </div>
                            </td>
                            <td className="variant-mrp-cell">₹{formatNumber(parseFloat(item.mrp))}</td>
                            <td className="variant-markup-cell">
                              {isEditMode ? (
                                <input
                                  type="number"
                                  value={editedItems[item.id]?.markup !== undefined ? editedItems[item.id].markup : (parseFloat(item.markup_price) > 0 ? item.markup_price : '')}
                                  onChange={(e) => handleEditMarkupChange(item.id, e.target.value)}
                                  onFocus={(e) => {
                                    // Only clear placeholder if the field is actually empty
                                    if (e.target.value === '') {
                                      e.target.placeholder = '';
                                    }
                                  }}
                                  onBlur={(e) => {
                                    if (e.target.value === '') {
                                      e.target.placeholder = '0';
                                    }
                                  }}
                                  onWheel={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.target.blur(); // Remove focus to prevent further wheel events
                                    setTimeout(() => e.target.focus(), 0); // Restore focus
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }
                                  }}
                                  min="0"
                                  step="0.01"
                                  className="edit-markup-input"
                                  placeholder="0"
                                />
                              ) : (
                                <span>₹{formatNumber(parseFloat(item.markup_price || 0))}</span>
                              )}
                            </td>
                            <td className="variant-price-cell">₹{formatNumber(parseFloat(item.mrp) + getMarkupValue(item.id, item.markup_price))}</td>
                            <td className="variant-stock-cell">
                              <div className="stock-quantity">
                                <span className="quantity-value">{item.quantity}</span>
                              </div>
                            </td>
                            <td className="variant-updated-cell">
                              <div className="last-updated">
                                {item.last_updated ? new Date(item.last_updated).toLocaleDateString() : 'N/A'}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Selected products for onboarding */}
          {selectedProducts.length > 0 && (
            <div className="selected-products-section">
              <div className="selected-header">
                <h3 className="section-title">Selected Products ({selectedProducts.length})</h3>
                <div className="total-value">Total Value: ₹{formatNumber(selectedProducts.reduce((sum, product) => sum + (product.quantity * (parseFloat(product.mrp) + parseFloat(product.markup))), 0))}</div>
              </div>
              <div className="products-table">
                <table>
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Brand Details</th>
                      <th>Pack Info</th>
                      <th>MRP</th>
                      <th>Quantity</th>
                      <th>Markup</th>
                      <th>Final Price</th>
                      <th>Total Value</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedProducts.map((product, index) => {
                      const finalPrice = parseFloat(product.mrp) + parseFloat(product.markup);
                      const totalValue = product.quantity * finalPrice;
                      return (
                        <tr key={product.id}>
                          <td>{index + 1}</td>
                          <td>
                            <div className="brand-details">
                              <div className="brand-name">{product.name}</div>
                              <div className="brand-number">#{product.brandNumber}</div>
                            </div>
                          </td>
                          <td>
                            <div className="pack-info">
                              <div className="pack-size">{product.packQuantity} × {product.size}ml</div>
                              <div className="pack-type">
                                Type: {product.packType}
                              </div>
                            </div>
                          </td>
                          <td>₹{product.mrp}</td>
                          <td>
                            <input
                              type="number"
                              value={product.quantity === 0 ? '' : product.quantity}
                              onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                              onFocus={(e) => {
                                if (e.target.value === '') {
                                  e.target.placeholder = '';
                                }
                              }}
                              onBlur={(e) => {
                                if (e.target.value === '') {
                                  e.target.placeholder = '0';
                                }
                              }}
                              onWheel={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }
                              }}
                              min="0"
                              className="quantity-input"
                              placeholder="0"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={product.markup === 0 ? '' : product.markup}
                              onChange={(e) => handleMarkupChange(product.id, e.target.value)}
                              onFocus={(e) => {
                                e.target.placeholder = '';
                              }}
                              onBlur={(e) => {
                                if (e.target.value === '') {
                                  e.target.placeholder = '0';
                                }
                              }}
                              onWheel={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }
                              }}
                              min="0"
                              step="0.01"
                              className="markup-input"
                              placeholder="0"
                            />
                          </td>
                          <td>₹{finalPrice.toFixed(2)}</td>
                          <td>₹{formatNumber(totalValue)}</td>
                          <td>
                            <button 
                              className="remove-btn"
                              onClick={() => removeProduct(product.id)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {selectedProducts.length > 0 && (
          <div className="summary-section">
            <div className="summary-stats">
              <div className="stat-item">
                <span className="stat-label">TOTAL PRODUCTS:</span>
                <span className="stat-value">{selectedProducts.length}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">TOTAL QUANTITY:</span>
                <span className="stat-value">{selectedProducts.reduce((sum, product) => sum + product.quantity, 0)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">TOTAL VALUE:</span>
                <span className="stat-value">₹{formatNumber(selectedProducts.reduce((sum, product) => sum + (product.quantity * (parseFloat(product.mrp) + parseFloat(product.markup))), 0))}</span>
              </div>
            </div>
            <button 
              className="save-btn"
              onClick={handleSaveStockOnboarding}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Stock Onboarding'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default StockOnboarding;