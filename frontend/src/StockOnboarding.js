import React, { useState, useEffect, useRef } from 'react';
import './StockOnboarding.css';
import { useUserContext } from './contexts/UserContext';
import { apiGet, apiPost } from './apiUtils';
import { getCurrentUser } from './authUtils';

function StockOnboarding({ onNavigate, onLogout, isAuthenticated }) {
  const [masterBrands, setMasterBrands] = useState([]);
  const [shopInventory, setShopInventory] = useState([]);
  const [filteredBrands, setFilteredBrands] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [draggedOver, setDraggedOver] = useState(null);

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
    
    if (istTime.getHours() < 11 || (istTime.getHours() === 11 && istTime.getMinutes() < 30)) {
      // Before 11:30 AM IST - use previous day
      const yesterday = new Date(istTime);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toLocaleDateString('en-CA');
    } else {
      // After 11:30 AM IST - use current day
      return istTime.toLocaleDateString('en-CA');
    }
  };

  const businessDate = getBusinessDate();

  useEffect(() => {
    fetchMasterBrands();
    fetchShopInventory();
  }, []);

  // Auto-refresh shop inventory every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchShopInventory();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, []);

  const fetchMasterBrands = async () => {
    try {
      // Fetch all master brands without pack type filter
      const response = await apiGet('/api/master-brands');
      const brands = await response.json();
      console.log('Loaded master brands:', brands.length);
        
        // Debug: Check pack types distribution
        const packTypeStats = brands.reduce((stats, brand) => {
          stats[brand.packType] = (stats[brand.packType] || 0) + 1;
          return stats;
        }, {});
        console.log('Pack type distribution:', packTypeStats);
        
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
        console.log('Brands with multiple pack types:', brandsWithMultiplePackTypes.length);
        if (brandsWithMultiplePackTypes.length > 0) {
          console.log('Sample brand with multiple pack types:', brandsWithMultiplePackTypes[0]);
        }
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
      setShopInventory(data.products || []);
      console.log('Loaded shop inventory:', data.products?.length || 0);
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
      
      // Then filter out products that already exist in inventory
      const filtered = searchFiltered.filter(brand => {
        // Check if this brand exists in shop inventory (by master_brand_id)
        const inventoryItem = shopInventory.find(inventoryItem => 
          inventoryItem.master_brand_id === brand.id
        );
        
        const existsInInventory = !!inventoryItem;
        
        // Debug logging for all searches to understand filtering
        console.log('🔍 Filtering brand:', {
          name: brand.name,
          packType: brand.packType,
          masterBrandId: brand.id,
          existsInInventory: existsInInventory,
          openingStock: inventoryItem?.openingStock || 0,
          willShow: !existsInInventory,
          inventoryLength: shopInventory?.length || 0
        });
        
        return !existsInInventory; // Only show products NOT in inventory
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
    setSearchTerm('');
    setShowSearchResults(false);
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

  const handleSaveStockOnboarding = async () => {
    if (selectedProducts.length === 0) {
      alert('Please select at least one product to onboard');
      return;
    }

    // Validate all products have quantity > 0
    const invalidProducts = selectedProducts.filter(p => !p.quantity || p.quantity <= 0);
    if (invalidProducts.length > 0) {
      alert('Please enter quantity greater than 0 for all products');
      return;
    }

    setSaving(true);
    try {
      const businessDate = getBusinessDate();
      console.log('🗓️ Using business date for stock onboarding:', businessDate);

      const response = await apiPost('/api/stock-onboarding/save', {
        products: selectedProducts,
        businessDate: businessDate
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
        console.error('Server error response:', error);
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
    
    return Object.values(grouped);
  };

  // Drag and Drop functionality
  const handleDragStart = (e, item, index) => {
    setDraggedItem({ item, index });
    e.dataTransfer.effectAllowed = 'move';
    e.target.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDraggedItem(null);
    setDraggedOver(null);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDraggedOver(index);
  };

  const handleDragLeave = (e) => {
    setDraggedOver(null);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    
    if (!draggedItem || draggedItem.index === dropIndex) {
      return;
    }

    const newInventory = [...(shopInventory || [])];
    const draggedItemData = newInventory[draggedItem.index];
    
    // Remove the dragged item
    newInventory.splice(draggedItem.index, 1);
    
    // Insert at new position
    newInventory.splice(dropIndex, 0, draggedItemData);
    
    setShopInventory(newInventory);
    setDraggedItem(null);
    setDraggedOver(null);
  };

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
    const inputs = document.querySelectorAll('.quantity-input, .markup-input');
    
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
  }, [selectedProducts]);

  return (
    <div className="stock-onboarding-container">
      <header className="stock-header">
        <div className="logo-section">
          <h1 className="app-title">{shopName}</h1>
          <p className="app-subtitle">Inventory Management</p>
        </div>
        <nav className="navigation">
          <button className="nav-btn" onClick={() => onNavigate('dashboard')}>Dashboard</button>
          <button className="nav-btn active">Stock Onboarding</button>
          <button className="nav-btn" onClick={() => onNavigate('manageStock')}>Manage Stock</button>
          <button className="nav-btn" onClick={() => onNavigate('sheets')}>Sheets</button>
          <button className="nav-btn" onClick={() => onNavigate('reports')}>Reports</button>
          <button className="nav-btn logout-btn" onClick={onLogout}>Log Out</button>
        </nav>
      </header>
      
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
          <div className="search-box">
            <div className="search-icon">🔍</div>
            <input
              type="text"
              className="search-field"
              placeholder="Search by brand name, number, or size code..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            
            {showSearchResults && (
              <div className="search-results">
                {filteredBrands.map(brand => (
                  <div 
                    key={brand.id} 
                    className="search-result-item"
                    onClick={() => handleProductSelect(brand)}
                  >
                    <div className="brand-info">
                      <h4 className="brand-name">{brand.name} - ({brand.brandNumber}) | Size: {brand.packQuantity} × {brand.size}ml | Pack Type: {brand.packType} | MRP: ₹{brand.mrp}</h4>
                      <div className="brand-details">
                        {brand.brandKind && <span className="brand-kind">{brand.brandKind}</span>}
                        {brand.sizeCode && <span className="size-code">Size Code: {brand.sizeCode}</span>}
                        {brand.productType && <span className="product-type">{brand.productType}</span>}
                      </div>
                    </div>
                  </div>
                ))}
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
              <div className="inventory-stats">
                <div className="inventory-value">
                  <div className="value-label">Total Quantities</div>
                  <div className="value-amount">{shopInventory?.reduce((sum, item) => sum + item.quantity, 0) || 0}</div>
                </div>
                <div className="inventory-value">
                  <div className="value-label">Total Stock Value</div>
                  <div className="value-amount">₹{formatNumber(shopInventory?.reduce((sum, item) => sum + parseFloat(item.mrp) * item.quantity, 0) || 0)}</div>
                </div>
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
                      <th>
                        <div className="price-header">
                          <div>PRICE</div>
                          <div className="price-subtitle">(MRP + MARKUP)</div>
                        </div>
                      </th>
                      <th>Current Stock</th>
                      <th>Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupInventoryByBrand(shopInventory || []).map((brandGroup) => 
                      brandGroup.items.map((item, itemIndex) => (
                        <tr 
                          key={item.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, item, (shopInventory || []).findIndex(inv => inv.id === item.id))}
                          onDragEnd={handleDragEnd}
                          onDragOver={(e) => handleDragOver(e, (shopInventory || []).findIndex(inv => inv.id === item.id))}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, (shopInventory || []).findIndex(inv => inv.id === item.id))}
                          className={`inventory-row ${draggedOver === (shopInventory || []).findIndex(inv => inv.id === item.id) ? 'drag-over' : ''} ${draggedItem?.index === (shopInventory || []).findIndex(inv => inv.id === item.id) ? 'dragging' : ''} ${itemIndex === brandGroup.items.length - 1 ? 'brand-group-end' : ''}`}
                        >
                          {itemIndex === 0 && (
                            <>
                              <td className="grouped-serial" rowSpan={brandGroup.items.length}>
                                <div className="drag-handle-container">
                                  <span className="serial-number">{brandGroup.serialNumber}</span>
                                  <div className="drag-handle" title="Drag to reorder">
                                    ⋮⋮
                                  </div>
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
                          <td className="variant-price-cell">₹{formatNumber(parseFloat(item.mrp) + parseFloat(item.markup_price || 0))}</td>
                          <td className="variant-stock-cell">
                            <div className="stock-quantity">
                              <span className="quantity-value">{item.quantity}</span>
                              <span className="quantity-unit">units</span>
                            </div>
                          </td>
                          <td className="variant-updated-cell">
                            <div className="last-updated">
                              {item.last_updated ? new Date(item.last_updated).toLocaleDateString() : 'N/A'}
                            </div>
                          </td>
                        </tr>
                      ))
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
                              onWheel={handleInputEvents}
                              onKeyDown={handleInputEvents}
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
                                if (e.target.value === '') {
                                  e.target.placeholder = '';
                                }
                              }}
                              onBlur={(e) => {
                                if (e.target.value === '') {
                                  e.target.placeholder = '0.00';
                                }
                              }}
                              onWheel={handleInputEvents}
                              onKeyDown={handleInputEvents}
                              min="0"
                              step="0.01"
                              className="markup-input"
                              placeholder="0.00"
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