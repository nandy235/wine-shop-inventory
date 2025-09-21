import React, { useState, useEffect } from 'react';
import './AddStore.css';
import { apiGet, apiPost, apiDelete } from './apiUtils';
import { getCurrentShopFromJWT, getShopNameForDisplay } from './jwtUtils';
import { sanitizeRetailerCode, validateRetailerCode, sanitizeInput } from './authUtils';
import Navigation from './components/Navigation';

function AddStore({ onNavigate, onLogout }) {
  const [stores, setStores] = useState([]);
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
    fetchStores();
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

  const fetchStores = async () => {
    setLoading(true);
    setError(null);
    
    // Token no longer needed - apiUtils handles authentication automatically

    try {
      // Use the unified /api/stores endpoint
      const response = await apiGet('/api/stores');

      if (!response.ok) {
        throw new Error('Failed to fetch stores');
      }

      const storesData = await response.json();
      console.log('Stores data from API:', storesData);
      
      // The API already includes TGBCL, so just use the response directly
      setStores(storesData);
    } catch (error) {
      console.error('Error fetching stores:', error);
      setError('Failed to fetch stores');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    let processedValue = value;
    
    // Handle different input types with proper sanitization
    if (name === 'retailerCode') {
      processedValue = sanitizeRetailerCode(value);
    } else if (name === 'shopName') {
      processedValue = sanitizeInput(value);
    } else if (name === 'contact') {
      // Keep contact as digits only, max 10
      processedValue = value.replace(/\D/g, '').slice(0, 10);
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: processedValue
    }));
  };

  const validateForm = () => {
    if (!formData.shopName.trim()) {
      setError('Shop name is required');
      return false;
    }
    if (!validateRetailerCode(formData.retailerCode)) {
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
      // Token no longer needed - apiUtils handles authentication automatically

      const response = await apiPost('/api/stores', {
        shopName: formData.shopName.trim(),
        retailerCode: formData.retailerCode,
        contact: formData.contact
      });
      const data = await response.json();
      setSuccess('Store added successfully!');
      resetForm();
      fetchStores();
    } catch (error) {
      console.error('Error adding store:', error);
      setError('Error adding store');
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

  const handleDelete = async (storeId, store) => {
    if (storeId === 'tgbcl') {
      setError('Cannot delete the default TGBCL store');
      return;
    }

    if (store.source === 'user_shop' || store.source === 'internal') {
      setError('Cannot delete internal stores (shops belonging to the same user).');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this store?')) {
      return;
    }

    try {
      setLoading(true);
      const response = await apiDelete(`/api/stores/${storeId}`);

      if (response.ok) {
        setSuccess('Store deleted successfully!');
        fetchStores();
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to delete store');
      }
    } catch (error) {
      console.error('Error deleting store:', error);
      setError('Error deleting store');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-supplier-container">
      <Navigation 
        currentPage="addStore"
        onNavigate={onNavigate}
        onLogout={onLogout}
        shopName={currentShopName}
      />

      <main className="add-supplier-content">
        <div className="page-title-section">
          <h2 className="main-title">Add Store</h2>
          <p className="subtitle">Add new stores to your network</p>
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
                {loading ? 'Adding...' : 'Add Store'}
              </button>
            </div>
          </form>
        </div>

        <div className="suppliers-list-section">
          <h3 className="section-title">Existing Stores</h3>
          {loading && stores.length === 0 ? (
            <div className="loading-message">Loading stores...</div>
          ) : stores.length === 0 ? (
            <div className="empty-message">No stores found. TGBCL will be added as default.</div>
          ) : (
            <div className="suppliers-table-container">
              <table className="suppliers-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Store</th>
                    <th>Retailer Code</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((store, index) => (
                    <tr key={store.id} className={store.is_default ? 'default-row' : ''}>
                      <td>{index + 1}</td>
                      <td>
                        <div className="supplier-name-cell">
                          <span>{store.shop_name}</span>
                        </div>
                      </td>
                      <td>{store.retailer_code}</td>
                      <td>
                        {store.id === 'tgbcl' || store.store_type === 'default' || store.store_type === 'internal' ? (
                          <span className="default-badge-inline">Default</span>
                        ) : (
                          <button
                            className="action-btn delete-btn"
                            onClick={() => handleDelete(store.id, store)}
                            title="Delete store"
                          >
                            Delete
                          </button>
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

export default AddStore;
