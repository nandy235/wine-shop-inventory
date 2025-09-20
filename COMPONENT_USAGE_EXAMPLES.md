# Component Usage Examples - Production Authentication

## 🎯 **How to Use the Production-Ready Authentication System**

This guide shows how to properly use the authentication system in your React components with comprehensive error handling and user feedback.

---

## 🏗️ **Basic Component Structure**

### **Standard Component with Authentication**
```javascript
import React, { useState } from 'react';
import { apiCallWithErrorInfo, AuthErrorTypes } from '../apiUtils';
import { useUser } from '../hooks/useUser';

function MyComponent({ isAuthenticated, onLogout }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  // Get user data with auth error handling
  const handleAuthError = () => {
    console.warn('Authentication expired in MyComponent');
    onLogout();
  };
  
  const { user, loading: userLoading, error: userError } = useUser(isAuthenticated, handleAuthError);

  const handleApiCall = async () => {
    setLoading(true);
    setError(null);

    const result = await apiCallWithErrorInfo('/api/some-endpoint', {
      method: 'POST',
      body: JSON.stringify({ someData: 'value' })
    });

    if (!result.success) {
      switch (result.error) {
        case AuthErrorTypes.UNAUTHORIZED:
          // Authentication expired - handled by onLogout
          handleAuthError();
          break;
        case AuthErrorTypes.NETWORK_ERROR:
          setError('Network connection failed. Please check your internet connection.');
          break;
        case AuthErrorTypes.SERVER_ERROR:
          setError('Server error occurred. Please try again later.');
          break;
        case AuthErrorTypes.FORBIDDEN:
          setError('You do not have permission to perform this action.');
          break;
        default:
          setError('An unexpected error occurred. Please try again.');
      }
    } else {
      // Handle success
      try {
        const responseData = await result.response.json();
        setData(responseData);
      } catch (parseError) {
        setError('Failed to process server response.');
      }
    }

    setLoading(false);
  };

  // Show loading state
  if (userLoading) {
    return <div>Loading user data...</div>;
  }

  // Show user error
  if (userError) {
    return <div>Error loading user: {userError}</div>;
  }

  return (
    <div>
      <h1>Welcome, {user?.name || 'User'}!</h1>
      <p>Shop: {user?.shopName || 'Unknown'}</p>
      
      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      
      <button onClick={handleApiCall} disabled={loading}>
        {loading ? 'Loading...' : 'Make API Call'}
      </button>
      
      {data && (
        <div>
          <h2>Data:</h2>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default MyComponent;
```

---

## 🔄 **Advanced Error Handling with useApiError Hook**

### **Component Using Centralized Error Handling**
```javascript
import React, { useState } from 'react';
import { apiGet, apiPost } from '../apiUtils';
import { useApiError } from '../hooks/useApiError';
import { useUser } from '../hooks/useUser';

function AdvancedComponent({ isAuthenticated, onLogout }) {
  const [products, setProducts] = useState([]);
  
  // Centralized error handling
  const { error, loading, handleApiCall, clearError } = useApiError(onLogout);
  
  // User data with auth error handling
  const { user } = useUser(isAuthenticated, onLogout);

  const fetchProducts = async () => {
    const response = await handleApiCall(apiGet, '/api/products');
    if (response) {
      const data = await response.json();
      setProducts(data.products || []);
    }
  };

  const createProduct = async (productData) => {
    const response = await handleApiCall(apiPost, '/api/products', productData);
    if (response) {
      // Refresh products list
      await fetchProducts();
    }
  };

  return (
    <div>
      <h1>{user?.shopName || 'Shop'} - Products</h1>
      
      {/* Centralized error display */}
      {error && (
        <div className="error-banner">
          <span>{error.message}</span>
          <button onClick={clearError}>×</button>
        </div>
      )}
      
      {/* Loading indicator */}
      {loading && <div className="loading-spinner">Loading...</div>}
      
      {/* Products list */}
      <div>
        {products.map(product => (
          <div key={product.id}>{product.name}</div>
        ))}
      </div>
      
      <button onClick={fetchProducts} disabled={loading}>
        Refresh Products
      </button>
    </div>
  );
}
```

---

## 📁 **File Upload Component**

### **Secure File Upload with Progress**
```javascript
import React, { useState } from 'react';
import { secureFileUpload, AuthErrorTypes } from '../apiUtils';

function FileUploadComponent({ onLogout }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleFileUpload = async () => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(false);
    setProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await secureFileUpload('/api/upload', formData);
      
      if (response.ok) {
        setSuccess(true);
        setFile(null);
        setProgress(100);
      } else if (response.status === 401) {
        setError('Session expired. Please log in again.');
        onLogout();
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Upload failed');
      }
    } catch (error) {
      if (error.message.includes('timeout')) {
        setError('Upload timed out. Please try with a smaller file.');
      } else {
        setError(`Upload failed: ${error.message}`);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h2>File Upload</h2>
      
      <input
        type="file"
        onChange={(e) => setFile(e.target.files[0])}
        disabled={uploading}
      />
      
      <button onClick={handleFileUpload} disabled={!file || uploading}>
        {uploading ? 'Uploading...' : 'Upload File'}
      </button>
      
      {uploading && (
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      
      {error && (
        <div className="error-message">{error}</div>
      )}
      
      {success && (
        <div className="success-message">File uploaded successfully!</div>
      )}
    </div>
  );
}
```

---

## 🔐 **Authentication-Aware Form Component**

### **Form with Comprehensive Error Handling**
```javascript
import React, { useState } from 'react';
import { apiPost, AuthErrorTypes } from '../apiUtils';

function ProductForm({ onLogout, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    quantity: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});

    try {
      const response = await apiPost('/api/products', formData);
      
      if (response.ok) {
        const result = await response.json();
        onSuccess(result);
        setFormData({ name: '', price: '', quantity: '' });
      } else if (response.status === 401) {
        setErrors({ general: 'Session expired. Please log in again.' });
        setTimeout(onLogout, 2000);
      } else if (response.status === 400) {
        const errorData = await response.json();
        if (errorData.errors) {
          // Handle validation errors
          const fieldErrors = {};
          errorData.errors.forEach(error => {
            fieldErrors[error.field] = error.message;
          });
          setErrors(fieldErrors);
        } else {
          setErrors({ general: errorData.message || 'Validation failed' });
        }
      } else {
        setErrors({ general: 'Failed to create product. Please try again.' });
      }
    } catch (error) {
      if (error.message.includes('timeout')) {
        setErrors({ general: 'Request timed out. Please check your connection.' });
      } else if (error.message.includes('Network error')) {
        setErrors({ general: 'Network error. Please check your connection.' });
      } else {
        setErrors({ general: 'An unexpected error occurred.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Add Product</h2>
      
      {errors.general && (
        <div className="error-message">{errors.general}</div>
      )}
      
      <div>
        <label>Product Name:</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})}
          disabled={submitting}
        />
        {errors.name && <span className="field-error">{errors.name}</span>}
      </div>
      
      <div>
        <label>Price:</label>
        <input
          type="number"
          value={formData.price}
          onChange={(e) => setFormData({...formData, price: e.target.value})}
          disabled={submitting}
        />
        {errors.price && <span className="field-error">{errors.price}</span>}
      </div>
      
      <div>
        <label>Quantity:</label>
        <input
          type="number"
          value={formData.quantity}
          onChange={(e) => setFormData({...formData, quantity: e.target.value})}
          disabled={submitting}
        />
        {errors.quantity && <span className="field-error">{errors.quantity}</span>}
      </div>
      
      <button type="submit" disabled={submitting}>
        {submitting ? 'Creating...' : 'Create Product'}
      </button>
    </form>
  );
}
```

---

## 📊 **Data Fetching Component with Retry**

### **Robust Data Loading with User Feedback**
```javascript
import React, { useState, useEffect } from 'react';
import { apiGet, AuthErrorTypes } from '../apiUtils';

function DataTable({ isAuthenticated, onLogout }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const fetchData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);

    try {
      const response = await apiGet('/api/data');
      
      if (response.ok) {
        const result = await response.json();
        setData(result.data || []);
        setRetryCount(0);
      } else if (response.status === 401) {
        setError('Session expired');
        onLogout();
      } else {
        setError(`Failed to load data: HTTP ${response.status}`);
      }
    } catch (error) {
      if (error.message.includes('timeout')) {
        setError('Request timed out. The server may be slow.');
      } else if (error.message.includes('Network error')) {
        setError('Network connection failed.');
      } else {
        setError('Failed to load data.');
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    fetchData();
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h3>Error Loading Data</h3>
        <p>{error}</p>
        <div>
          <button onClick={handleRetry}>
            Retry {retryCount > 0 && `(${retryCount})`}
          </button>
          <button onClick={() => fetchData(false)}>
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="table-header">
        <h2>Data Table ({data.length} items)</h2>
        <button onClick={() => fetchData(false)}>Refresh</button>
      </div>
      
      {data.length === 0 ? (
        <p>No data available.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map(item => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td>{item.name}</td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

---

## 🎨 **CSS Classes for Error States**

### **Recommended Styling**
```css
/* Error Messages */
.error-message {
  background-color: #fee;
  border: 1px solid #fcc;
  color: #c33;
  padding: 12px;
  border-radius: 4px;
  margin: 10px 0;
}

.error-banner {
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  color: #721c24;
  padding: 12px;
  border-radius: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.field-error {
  color: #dc3545;
  font-size: 0.875em;
  margin-top: 4px;
  display: block;
}

/* Success Messages */
.success-message {
  background-color: #d4edda;
  border: 1px solid #c3e6cb;
  color: #155724;
  padding: 12px;
  border-radius: 4px;
  margin: 10px 0;
}

/* Loading States */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
}

.spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Progress Bar */
.progress-bar {
  width: 100%;
  height: 20px;
  background-color: #f0f0f0;
  border-radius: 10px;
  overflow: hidden;
  margin: 10px 0;
}

.progress-fill {
  height: 100%;
  background-color: #4caf50;
  transition: width 0.3s ease;
}
```

---

## 🔑 **Key Principles**

### **1. Always Handle Authentication Errors**
- Pass `onLogout` callback to handle expired sessions
- Use consistent error handling across components
- Provide clear user feedback for auth issues

### **2. Implement Proper Loading States**
- Show loading indicators during API calls
- Disable form inputs during submission
- Provide progress feedback for long operations

### **3. Use Descriptive Error Messages**
- Differentiate between network, auth, and validation errors
- Provide actionable error messages
- Include retry options where appropriate

### **4. Graceful Degradation**
- Handle network failures gracefully
- Provide offline indicators when possible
- Allow users to retry failed operations

---

**This authentication system provides a solid foundation for building robust, user-friendly React applications with enterprise-grade security!** 🛡️
