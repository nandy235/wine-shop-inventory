import React, { useState, useEffect } from 'react';
import './AddSupplier.css';
import API_BASE_URL from './config';
import { getCurrentShopFromJWT, getShopNameForDisplay } from './jwtUtils';
import SettingsDropdown from './SettingsDropdown';

function AddSupplier({ onNavigate, onLogout }) {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [formData, setFormData] = useState({
    shopName: '',
    retailerCode: '',
    contact: ''
  });

  const currentShopName = getShopNameForDisplay();

  useEffect(() => {
    fetchSuppliers();
  }, []);

  // Auto-dismiss success message after 4 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess('');
      }, 4000);
      
      return () => clearTimeout(timer);
    }
  }, [success]);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // Fetch both user's own shops and manually added suppliers
      const [userShopsResponse, supplierShopsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/user-shops`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch(`${API_BASE_URL}/api/supplier-shops`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
      ]);

      const allSuppliers = [];
      
      // Always include TGBCL as the first supplier
      const tgbclSupplier = {
        id: 'tgbcl',
        shop_name: 'TGBCL',
        retailer_code: 'TGBCL',
        contact: 'Default Supplier',
        is_default: true,
        source: 'default'
      };
      allSuppliers.push(tgbclSupplier);

      // Add user's own shops as suppliers (excluding current shop)
      if (userShopsResponse.ok) {
        const userShopsData = await userShopsResponse.json();
        
        // Get current shop data from JWT token (secure)
        const currentShop = getCurrentShopFromJWT();
        console.log('Current shop from JWT:', currentShop);
        console.log('User shops data:', userShopsData);
        
        const userShopsAsSuppliers = (userShopsData.shops || [])
          .filter(shop => {
            console.log(`Checking shop: ID=${shop.id}, ShopName=${shop.shop_name}, RetailerCode=${shop.retailer_code}`);
            console.log(`Current shop: ID=${currentShop.shopId}, RetailerCode=${currentShop.retailerCode}`);
            
            // Exclude current shop using secure JWT data
            // Primary: Filter by shopId (most reliable)
            if (currentShop.shopId && shop.id) {
              return shop.id !== currentShop.shopId;
            }
            // Fallback: Filter by retailerCode (unique identifier)
            if (currentShop.retailerCode && shop.retailer_code) {
              return shop.retailer_code !== currentShop.retailerCode;
            }
            // Last resort: Filter by shop name (less reliable but better than nothing)
            return shop.shop_name !== currentShopName;
          })
          .map(shop => ({
            id: `user_shop_${shop.id}`,
            shop_name: shop.shop_name,
            retailer_code: shop.retailer_code,
            contact: shop.address || 'N/A', // Use address as contact since contact field doesn't exist
            is_default: false,
            source: 'user_shop'
          }));
        
        console.log('User shops as suppliers:', userShopsAsSuppliers);
        allSuppliers.push(...userShopsAsSuppliers);
      }

      // Add manually added suppliers
      if (supplierShopsResponse.ok) {
        const supplierShopsData = await supplierShopsResponse.json();
        const manualSuppliers = (supplierShopsData.shops || []).map(shop => ({
          ...shop,
          source: 'manual'
        }));
        allSuppliers.push(...manualSuppliers);
      }

      setSuppliers(allSuppliers);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      // Always show TGBCL even if there's an error
      setSuppliers([{
        id: 'tgbcl',
        shop_name: 'TGBCL',
        retailer_code: 'TGBCL',
        contact: 'Default Supplier',
        is_default: true,
        source: 'default'
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Handle retailer code validation (only allow digits, max 7)
    if (name === 'retailerCode') {
      const digitsOnly = value.replace(/\D/g, '').slice(0, 7);
      setFormData(prev => ({
        ...prev,
        [name]: digitsOnly
      }));
      return;
    }
    
    // Handle contact validation (only allow digits, max 10)
    if (name === 'contact') {
      const digitsOnly = value.replace(/\D/g, '').slice(0, 10);
      setFormData(prev => ({
        ...prev,
        [name]: digitsOnly
      }));
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateForm = () => {
    if (!formData.shopName.trim()) {
      setError('Shop name is required');
      return false;
    }
    if (!formData.retailerCode || formData.retailerCode.length !== 7) {
      setError('Retailer code must be exactly 7 digits');
      return false;
    }
    if (!formData.contact || formData.contact.length !== 10) {
      setError('Contact must be exactly 10 digits');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const response = await fetch(`${API_BASE_URL}/api/supplier-shops`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shopName: formData.shopName.trim(),
          retailerCode: formData.retailerCode,
          contact: formData.contact
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSuccess('Supplier shop added successfully!');
        resetForm();
        fetchSuppliers();
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to add supplier shop');
      }
    } catch (error) {
      console.error('Error adding supplier shop:', error);
      setError('Error adding supplier shop');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      shopName: '',
      retailerCode: '',
      contact: ''
    });
  };

  const handleDelete = async (supplierId, supplier) => {
    if (supplierId === 'tgbcl') {
      setError('Cannot delete the default TGBCL supplier');
      return;
    }

    if (supplier.source === 'user_shop') {
      setError('Cannot delete your own shops. They are automatically added as suppliers.');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this supplier shop?')) {
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/supplier-shops/${supplierId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setSuccess('Supplier shop deleted successfully!');
        fetchSuppliers();
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to delete supplier shop');
      }
    } catch (error) {
      console.error('Error deleting supplier shop:', error);
      setError('Error deleting supplier shop');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-supplier-container">
      <header className="add-supplier-header">
        <div className="logo-section">
          <h1 className="app-title">{currentShopName}</h1>
          <p className="app-subtitle">Supplier Management</p>
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

      <main className="add-supplier-content">
        <div className="page-title-section">
          <h2 className="main-title">Add Supplier Shop</h2>
          <p className="subtitle">Add new supplier shops to your network</p>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="supplier-form-section">
          <form onSubmit={handleSubmit} className="supplier-form">
            <div className="form-group">
              <label htmlFor="shopName">Shop Name *</label>
              <input
                type="text"
                id="shopName"
                name="shopName"
                value={formData.shopName}
                onChange={handleInputChange}
                placeholder="Enter shop name"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="retailerCode">Retailer Code *</label>
              <input
                type="text"
                id="retailerCode"
                name="retailerCode"
                value={formData.retailerCode}
                onChange={handleInputChange}
                placeholder="Must be exactly 7 digits"
                maxLength="7"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="contact">Contact *</label>
              <input
                type="text"
                id="contact"
                name="contact"
                value={formData.contact}
                onChange={handleInputChange}
                placeholder="Must be exactly 10 digits"
                maxLength="10"
                required
              />
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={resetForm}
                disabled={loading}
              >
                Reset Form
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={loading}
              >
                {loading ? 'Adding...' : 'Add Supplier'}
              </button>
            </div>
          </form>
        </div>

        <div className="suppliers-list-section">
          <h3 className="section-title">Existing Suppliers</h3>
          {loading && suppliers.length === 0 ? (
            <div className="loading-message">Loading suppliers...</div>
          ) : suppliers.length === 0 ? (
            <div className="empty-message">No suppliers found. TGBCL will be added as default.</div>
          ) : (
            <div className="suppliers-table-container">
              <table className="suppliers-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Supplier</th>
                    <th>Retailer Code</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((supplier, index) => (
                    <tr key={supplier.id} className={supplier.is_default ? 'default-row' : ''}>
                      <td>{index + 1}</td>
                      <td>
                        <div className="supplier-name-cell">
                          <span>{supplier.shop_name}</span>
                        </div>
                      </td>
                      <td>{supplier.retailer_code}</td>
                      <td>
                        {!supplier.is_default && supplier.source !== 'user_shop' ? (
                          <button
                            className="action-btn delete-btn"
                            onClick={() => handleDelete(supplier.id, supplier)}
                            title="Delete supplier"
                          >
                            Delete
                          </button>
                        ) : supplier.source === 'user_shop' ? (
                          <span className="auto-text">Auto</span>
                        ) : (
                          <span className="default-text">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default AddSupplier;
