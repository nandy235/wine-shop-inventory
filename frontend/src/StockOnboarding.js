import React, { useState, useEffect } from 'react';
import './StockOnboarding.css';
import API_BASE_URL from './config';

function StockOnboarding({ onNavigate }) {
  const [masterBrands, setMasterBrands] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentProduct, setCurrentProduct] = useState(null);
  const [cases, setCases] = useState(0);
  const [bottles, setBottles] = useState(0);
  const [markup, setMarkup] = useState(0);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');
  const shopName = user.shopName || 'test wines';

  useEffect(() => {
    fetchMasterBrands();
  }, []);

  const fetchMasterBrands = async () => {
    try {
      // Fetch brands with pack types C, B, G, P with stock onboarding logic
      // Logic: All C and B types + G/P preference (G preferred if both exist, otherwise the available one)
      const response = await fetch(`${API_BASE_URL}/api/master-brands?packTypes=C,B,G,P&stockOnboarding=true`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const brands = await response.json();
        setMasterBrands(brands);
      }
    } catch (error) {
      console.error('Error fetching master brands:', error);
    }
    setLoading(false);
  };

  const getSizeCode = (packQuantity) => {
    if (packQuantity === 12) return 'QQ';
    if (packQuantity === 24) return 'PP';
    if (packQuantity === 48) return 'NN';
    return packQuantity.toString();
  };

  const handleProductClick = (product) => {
    // Only reset values if selecting a different product
    if (!currentProduct || currentProduct.id !== product.id) {
      setCurrentProduct(product);
      setCases(0);
      setBottles(0);
      setMarkup(0);
    }
  };

  const handleBottlesChange = (value) => {
    const newBottles = parseInt(value) || 0;
    const packQuantity = currentProduct.packQuantity;
    
    // Only convert bottles to cases if cases field has a value (> 0)
    if (cases > 0 && newBottles >= packQuantity) {
      const extraCases = Math.floor(newBottles / packQuantity);
      const remainingBottles = newBottles % packQuantity;
      setCases(cases + extraCases);
      setBottles(remainingBottles);
    } else {
      // If cases is 0 or empty, just set bottles without conversion
      setBottles(newBottles);
    }
  };

  const calculateTotalBottles = () => {
    if (!currentProduct) return 0;
    return (cases * currentProduct.packQuantity) + bottles;
  };

  const handleAddProduct = async () => {
    if (!currentProduct || calculateTotalBottles() === 0) {
      alert('Please enter quantity');
      return;
    }

    try {
      const totalBottles = calculateTotalBottles();
      const requestData = {
        masterBrandId: currentProduct.id,
        quantity: totalBottles,
        shopMarkup: markup
      };
      
      console.log('📤 Sending product data:', requestData);
      console.log('💰 MRP:', currentProduct.mrp, 'Markup:', markup, 'Expected Final:', (parseFloat(currentProduct.mrp) + parseFloat(markup)));
    
      const response = await fetch(`${API_BASE_URL}/api/shop/add-product`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      });

      if (response.ok) {
        const result = await response.json();
        alert(`✅ ${currentProduct.name} onboarded successfully!\nReceived Quantity: ${totalBottles}\nUpdated in today's stock records.`);
        
        setCurrentProduct(null);
        setCases(0);
        setBottles(0);
        setMarkup(0);
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.message}`);
      }
    } catch (error) {
      console.error('Error onboarding product:', error);
      alert('❌ Network error. Please try again.');
    }
  };

  const handleCancel = () => {
    setCurrentProduct(null);
    setCases(0);
    setBottles(0);
    setMarkup(0);
  };

  const filteredBrands = masterBrands.filter(brand =>
    brand.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    brand.brandNumber.includes(searchTerm)
  );

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
          <button className="nav-btn">Settings</button>
        </nav>
      </header>
      
      <main className="stock-content">
        <div className="page-title-section">
          <h2 className="main-title">Stock Onboarding</h2>
          <p className="subtitle">Add received quantities to today's stock records</p>
        </div>
        
        <div className="controls-row">
          <div className="search-box">
            <input
              type="text"
              className="search-field"
              placeholder="Search by brand name or number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="view-button-box">
            <button 
              className="view-btn"
              onClick={() => onNavigate('viewCurrentStock')}
            >
              Current Stock
            </button>
          </div>
        </div>

        <div className="content-grid">
          <div className="products-panel">
            <h3 className="panel-title">Available Products</h3>
            {loading ? (
              <p>Loading products...</p>
            ) : (
              <div className="products-list">
                {filteredBrands.map(brand => (
                  <div 
                    key={brand.id} 
                    className={`product-card ${currentProduct?.id === brand.id ? 'selected' : ''}`}
                    onClick={() => handleProductClick(brand)}
                  >
                    <div className="product-info">
                      <h4 className="product-name">{brand.name}</h4>
                      <p className="product-detail">Brand #{brand.brandNumber}</p>
                      <p className="product-detail">{brand.packQuantity} × {brand.size}ml</p>

                      <p className="product-price">MRP: ₹{brand.mrp}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="input-panel">
            <h3 className="panel-title">Quantity Input</h3>
            {currentProduct ? (
              <div className="input-interface">
                <div className="product-header">
                  <h4 className="selected-name">{currentProduct.name}</h4>
                  <p className="selected-info">
                    Brand #{currentProduct.brandNumber} | {getSizeCode(currentProduct.packQuantity)} | {currentProduct.packQuantity} × {currentProduct.size}ml | MRP: ₹{currentProduct.mrp}
                  </p>
                </div>
                
                <div className="input-grid">
                  <div className="field-group">
                    <label>Cases:</label>
                    <input
                      type="number"
                      value={cases === 0 ? '' : cases}
                      onChange={(e) => setCases(parseInt(e.target.value) || 0)}
                      onFocus={(e) => e.target.select()}
                      onWheel={(e) => e.target.blur()}
                      min="0"
                      className="field-input"
                      placeholder="0"
                    />
                  </div>
                  
                  <div className="field-group">
                    <label>Bottles:</label>
                    <input
                      type="number"
                      value={bottles === 0 ? '' : bottles}
                      onChange={(e) => handleBottlesChange(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onWheel={(e) => e.target.blur()}
                      min="0"
                      className="field-input"
                      placeholder="0"
                    />
                  </div>
                  
                  <div className="field-group">
                    <label>Markup (₹):</label>
                    <input
                      type="number"
                      value={markup === 0 ? '' : markup}
                      onChange={(e) => {
                        const newMarkup = parseFloat(e.target.value) || 0;
                        console.log('🏷️ Markup changed:', e.target.value, '→', newMarkup);
                        setMarkup(newMarkup);
                      }}
                      onFocus={(e) => e.target.select()}
                      onWheel={(e) => e.target.blur()}
                      min="0"
                      step="0.01"
                      className="field-input"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                
                <div className="calc-display">
                  <p className="calc-total">
                    Total: {cases} cases + {bottles} bottles = <strong>{calculateTotalBottles()} total bottles</strong>
                  </p>
                  <p className="calc-price">
                    Final Price: ₹{(parseFloat(currentProduct.mrp || 0) + parseFloat(markup || 0)).toFixed(2)} per bottle
                  </p>
                  <p className="calc-note">
                    This will be added to <strong>"Received"</strong> in today's stock records
                  </p>
                </div>
                
                <div className="button-row">
                  <button className="add-btn" onClick={handleAddProduct}>
                    Add
                  </button>
                  <button className="cancel-btn" onClick={handleCancel}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="no-selection">
                <p>Select a product from the master brands list to add received quantities</p>
                <p className="help-text">This will update today's "Received" column for stock calculations</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default StockOnboarding;