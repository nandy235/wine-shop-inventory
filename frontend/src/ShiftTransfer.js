import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ShiftTransfer.css';
import API_BASE_URL from './config';
import { getCurrentShopFromJWT, getShopNameForDisplay } from './jwtUtils';
import SettingsDropdown from './SettingsDropdown';

function ShiftTransfer({ onNavigate, onLogout }) {
  console.log('🔍 ShiftTransfer - Component rendering');
  // Match IndentEstimate search behavior
  const SEARCH_DEBOUNCE_DELAY = 150;
  const MIN_SEARCH_LENGTH = 2;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Form state
  const [shiftType, setShiftType] = useState('in'); // 'in' or 'out'
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  
  // Product search state
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [shopProductsCache, setShopProductsCache] = useState([]);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [rowErrors, setRowErrors] = useState({});
  
  // Refs for search functionality (mirror IndentEstimate)
  const searchTimeoutRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchContainerRef = useRef(null);
  const abortControllerRef = useRef(null);
  
  const shopName = getShopNameForDisplay();
  // If switching to Shift Out while TGBCL selected, clear supplier
  useEffect(() => {
    if (shiftType === 'out' && selectedSupplier === 'tgbcl') {
      setSelectedSupplier('');
    }
  }, [shiftType, selectedSupplier]);
  const formatINR = (amount) => {
    const num = parseFloat(amount || 0);
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  // Prefetch shop inventory brands when shifting out
  useEffect(() => {
    console.log('🔍 ShiftTransfer - loadShopProducts useEffect triggered', { shiftType, shopProductsCacheLength: shopProductsCache.length });
    const loadShopProducts = async () => {
      try {
        console.log('🔍 ShiftTransfer - loadShopProducts called');
        const token = localStorage.getItem('token');
        const resp = await fetch(`${API_BASE_URL}/api/shop/products`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        console.log('🔍 ShiftTransfer - loadShopProducts response status:', resp.status);
        if (resp.ok) {
          const data = await resp.json();
          const items = Array.isArray(data) ? data : (data.products || data || []);
          console.log('🔍 ShiftTransfer - loadShopProducts items loaded:', items.length);
          setShopProductsCache(items);
        }
      } catch (e) {
        console.error('Failed to load shop products:', e);
      }
    };
    if (shiftType === 'out' && shopProductsCache.length === 0) {
      loadShopProducts();
    }
  }, [shiftType, shopProductsCache.length]);


  // Auto-dismiss success message
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess('');
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const fetchSuppliers = useCallback(async () => {
    try {
      console.log('🔍 ShiftTransfer - fetchSuppliers called');
      const token = localStorage.getItem('token');
      console.log('🔍 ShiftTransfer - token exists:', !!token);
      console.log('🔍 ShiftTransfer - API_BASE_URL:', API_BASE_URL);
      
      // Fetch suppliers from supplier_shops table
      const response = await fetch(`${API_BASE_URL}/api/supplier-shops`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('🔍 ShiftTransfer - fetchSuppliers response status:', response.status);

      let allSuppliers = [];

      // Add TGBCL as default supplier (only for shift in)
      allSuppliers.push({
        id: 'tgbcl',
        shop_name: 'TGBCL',
        retailer_code: 'TGBCL',
        source: 'default'
      });

      if (response.ok) {
        const data = await response.json();
        const suppliersData = data.shops || data || [];
        
        // Map supplier_shops table data to expected format
        const suppliersFromTable = suppliersData.map(supplier => ({
          id: `supplier_${supplier.id}`,
          shop_name: supplier.shop_name,
          retailer_code: supplier.retailer_code,
          contact: supplier.contact,
          source: 'supplier_shops'
        }));
        
        allSuppliers.push(...suppliersFromTable);
      }

      setSuppliers(allSuppliers);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      setError('Failed to load suppliers');
    }
  }, []);

  // Fetch suppliers on component mount
  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  // Product search identical to IndentEstimate (debounced + abortable)
  const handleSearch = useCallback(async (term) => {
    const searchQuery = (term || searchTerm).trim();
    if (!searchQuery || searchQuery.length < MIN_SEARCH_LENGTH) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    if (shiftType === 'out') {
      // Shift Out: Search current shop inventory via API
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/shop/products?search=${encodeURIComponent(searchQuery)}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          signal: abortControllerRef.current.signal
        });

        if (response.ok) {
          const data = await response.json();
          const results = Array.isArray(data) ? data : (data.products || []);
          const normalized = results.map(r => ({
            id: r.id,
            name: (r.brand_name || r.name || '').trim(),
            brandNumber: r.brand_number || r.brandNumber,
            packQuantity: Number(r.pack_quantity || r.packQuantity || 12),
            sizeMl: Number(r.size_ml || r.size || 0),
            mrp: r.standard_mrp ?? r.mrp ?? 0,
            packType: r.pack_type || r.packType || '',
            available: Number(
              // Prefer daily closing for the business date, else total stock, else raw quantity
              (r.closingStock ?? r.closing_stock) ??
              (r.totalStock ?? r.total_stock) ??
              (r.quantity ?? r.current_quantity) ?? 0
            )
          }));
          setSearchResults(normalized);
          setShowSearchResults(true);
        } else {
          console.error('Search failed:', response.status);
          setSearchResults([]);
          setShowSearchResults(false);
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Search error:', error);
          setSearchResults([]);
          setShowSearchResults(false);
        }
      }
      return;
    }

    // Shift In: Search based on supplier type
    if (!selectedSupplier) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    
    // Check supplier type first
    if (selectedSupplier === 'tgbcl') {
      // TGBCL: Always external, search all master brands
      console.log('🔍 Searching master brands for TGBCL');
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/search-brands?q=${encodeURIComponent(searchQuery)}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          signal: abortControllerRef.current.signal
        });

        if (response.ok) {
          const data = await response.json();
          const results = Array.isArray(data) ? data : (data.brands || []);
          const normalized = results.map(r => ({
            id: r.id,
            name: (r.brand_name || r.name || '').trim(),
            brandNumber: r.brand_number || r.brandNumber,
            packQuantity: Number(r.pack_quantity || r.packQuantity || 12),
            sizeMl: Number(r.size_ml || r.size || 0),
            mrp: r.standard_mrp ?? r.mrp ?? 0,
            packType: r.pack_type || r.packType || ''
          }));
          setSearchResults(normalized);
          setShowSearchResults(true);
        } else {
          setSearchResults([]);
          setShowSearchResults(false);
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error searching brands:', error);
          setSearchResults([]);
          setShowSearchResults(false);
        }
      }
    } else if (selectedSupplier?.startsWith('supplier_')) {
      // Check if supplier is internal or external
      const supplierId = selectedSupplier.replace('supplier_', '');
      console.log('🔍 Checking supplier type for supplier ID:', supplierId);
      
      try {
        const token = localStorage.getItem('token');
        const typeResponse = await fetch(`${API_BASE_URL}/api/check-supplier-type?supplierId=${supplierId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (typeResponse.ok) {
          const typeData = await typeResponse.json();
          console.log('🔍 Supplier type result:', typeData);
          
          if (typeData.isInternal) {
            // Internal supplier: Search that shop's inventory
            console.log('🔍 Searching internal shop inventory for shop ID:', typeData.shopInfo.id);
            if (abortControllerRef.current) {
              abortControllerRef.current.abort();
            }
            abortControllerRef.current = new AbortController();

            const searchResponse = await fetch(`${API_BASE_URL}/api/shop/products?shopId=${typeData.shopInfo.id}&search=${encodeURIComponent(searchQuery)}`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              signal: abortControllerRef.current.signal
            });

            if (searchResponse.ok) {
              const data = await searchResponse.json();
              const results = Array.isArray(data) ? data : (data.products || []);
              const normalized = results.map(r => ({
                id: r.id,
                name: (r.brand_name || r.name || '').trim(),
                brandNumber: r.brand_number || r.brandNumber,
                packQuantity: Number(r.pack_quantity || r.packQuantity || 12),
                sizeMl: Number(r.size_ml || r.size || 0),
                mrp: r.standard_mrp ?? r.mrp ?? 0,
                packType: r.pack_type || r.packType || '',
                available: Number(r.current_quantity || r.quantity || 0)
              }));
              setSearchResults(normalized);
              setShowSearchResults(true);
            } else {
              console.error('Search failed:', searchResponse.status);
              setSearchResults([]);
              setShowSearchResults(false);
            }
          } else {
            // External supplier: Search all master brands
            console.log('🔍 Searching master brands for external supplier:', typeData.supplierName);
            if (abortControllerRef.current) {
              abortControllerRef.current.abort();
            }
            abortControllerRef.current = new AbortController();

            const searchResponse = await fetch(`${API_BASE_URL}/api/search-brands?q=${encodeURIComponent(searchQuery)}`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              signal: abortControllerRef.current.signal
            });

            if (searchResponse.ok) {
              const data = await searchResponse.json();
              const results = Array.isArray(data) ? data : (data.brands || []);
              const normalized = results.map(r => ({
                id: r.id,
                name: (r.brand_name || r.name || '').trim(),
                brandNumber: r.brand_number || r.brandNumber,
                packQuantity: Number(r.pack_quantity || r.packQuantity || 12),
                sizeMl: Number(r.size_ml || r.size || 0),
                mrp: r.standard_mrp ?? r.mrp ?? 0,
                packType: r.pack_type || r.packType || ''
              }));
              setSearchResults(normalized);
              setShowSearchResults(true);
            } else {
              setSearchResults([]);
              setShowSearchResults(false);
            }
          }
        } else {
          console.error('Failed to check supplier type:', typeResponse.status);
          setSearchResults([]);
          setShowSearchResults(false);
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error checking supplier type:', error);
          setSearchResults([]);
          setShowSearchResults(false);
        }
      }
    } else {
      // Fallback: External supplier, search all master brands
      console.log('🔍 Searching master brands for external supplier (fallback):', selectedSupplier);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/search-brands?q=${encodeURIComponent(searchQuery)}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          signal: abortControllerRef.current.signal
        });

        if (response.ok) {
          const data = await response.json();
          const results = Array.isArray(data) ? data : (data.brands || []);
          const normalized = results.map(r => ({
            id: r.id,
            name: (r.brand_name || r.name || '').trim(),
            brandNumber: r.brand_number || r.brandNumber,
            packQuantity: Number(r.pack_quantity || r.packQuantity || 12),
            sizeMl: Number(r.size_ml || r.size || 0),
            mrp: r.standard_mrp ?? r.mrp ?? 0,
            packType: r.pack_type || r.packType || ''
          }));
          setSearchResults(normalized);
          setShowSearchResults(true);
        } else {
          setSearchResults([]);
          setShowSearchResults(false);
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error searching brands:', error);
          setSearchResults([]);
          setShowSearchResults(false);
        }
      }
    }
  }, [searchTerm, shiftType, selectedSupplier]);

  const handleInputChange = useCallback((e) => {
    const value = e.target.value.slice(0, 100);
    setSearchTerm(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(value);
    }, SEARCH_DEBOUNCE_DELAY);
  }, [handleSearch]);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      handleSearch();
    } else if (e.key === 'Escape') {
      setShowSearchResults(false);
      setSearchTerm('');
    }
  }, [handleSearch]);

  // Close results on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleBrandSelect = (brand) => {
    console.log('🔍 Frontend - Brand selected from search:', brand);
    
    // Normalize fields; include pack quantity and size ml
    const normalized = {
      id: brand.id,
      name: (brand.brand_name || brand.name || '').trim(),
      brandNumber: brand.brand_number || brand.brandNumber,
      packQuantity: Number(brand.pack_quantity || brand.packQuantity || 12),
      sizeMl: Number(brand.sizeMl ?? brand.size_ml ?? brand.size ?? 0),
      mrp: Number(brand.standard_mrp ?? brand.mrp ?? 0),
      packType: brand.packType || brand.pack_type || '',
      available: Number(brand.available || 0) // Include available quantity
    };
    
    console.log('🔍 Frontend - Normalized product:', normalized);

    const isAlreadySelected = selectedProducts.some(p => p.id === normalized.id);
    if (isAlreadySelected) {
      setError('This product is already added');
      setTimeout(() => setError(''), 3000);
      return;
    }

    // Add normalized brand to selected products with cases/bottles
    const newProduct = { ...normalized, cases: 0, bottles: 0 };

    setSelectedProducts(prev => [...prev, newProduct]);
    setSearchTerm('');
    setSearchResults([]);
    setShowSearchResults(false);
    setError('');
  };

  const handleCasesChange = (productId, value) => {
    const num = Math.max(0, parseInt(value) || 0);
    console.log('🔍 Frontend - handleCasesChange:', { productId, value, num });
    setSelectedProducts(prev => {
      const updated = prev.map(p => p.id === productId ? { ...p, cases: num } : p);
      console.log('🔍 Frontend - Updated selectedProducts after cases change:', updated);
      return updated;
    });
  };

  const handleBottlesChange = (productId, value) => {
    const num = Math.max(0, parseInt(value) || 0);
    console.log('🔍 Frontend - handleBottlesChange:', { productId, value, num });
    setSelectedProducts(prev => {
      const updated = prev.map(p => p.id === productId ? { ...p, bottles: num } : p);
      console.log('🔍 Frontend - Updated selectedProducts after bottles change:', updated);
      return updated;
    });
  };

  const validateAndMark = useCallback((productId) => {
    if (shiftType !== 'out') return;
    const product = selectedProducts.find(p => p.id === productId);
    if (!product) return;
    const requested = (product.cases || 0) * (product.packQuantity || 0) + (product.bottles || 0);
    // Robust available lookup for the business date
    const getAvailable = () => {
      let avail = Number(product.available || 0);
      if (!avail) {
        const match = shopProductsCache.find(sp => {
          const bn = sp.brand_number || sp.brandNumber;
          const bnP = product.brandNumber;
          const sz = Number(sp.size_ml || sp.size || 0);
          const szP = Number(product.sizeMl || 0);
          return bn && bnP && String(bn) === String(bnP) && sz === szP;
        });
        if (match) {
          avail = Number((match.closingStock ?? match.closing_stock) ?? (match.totalStock ?? match.total_stock) ?? (match.quantity ?? match.current_quantity) ?? 0);
        }
      }
      return avail;
    };
    const available = getAvailable();
    setRowErrors(prev => {
      const next = { ...prev };
      if (requested > available) {
        next[productId] = `${product.name}: available ${available}, requested ${requested}`;
      } else {
        delete next[productId];
      }
      return next;
    });
  }, [shiftType, selectedProducts]);

  const handleRemoveProduct = (productId) => {
    setSelectedProducts(prev => prev.filter(p => p.id !== productId));
  };

  const openRemoveConfirm = (product) => setRemoveTarget(product);
  const closeRemoveConfirm = () => setRemoveTarget(null);
  const confirmRemove = () => {
    if (removeTarget) {
      handleRemoveProduct(removeTarget.id);
      setRemoveTarget(null);
    }
  };

  const handleConfirmShift = async () => {
    const requestId = Date.now() + Math.random();
    console.log(`\n🚀 [${requestId}] ===== SHIFT TRANSFER OPERATION STARTED =====`);
    console.log(`🔍 [${requestId}] Frontend - handleConfirmShift called with state:`, {
      selectedSupplier,
      selectedProducts: selectedProducts.length,
      shiftType,
      loading,
      shopName: getShopNameForDisplay(),
      currentShop: getCurrentShopFromJWT()
    });
    console.log(`📋 [${requestId}] Selected Products Details:`, selectedProducts.map(p => ({
      id: p.id,
      name: p.name,
      brandNumber: p.brandNumber,
      cases: p.cases,
      bottles: p.bottles,
      totalQuantity: (p.cases * p.packQuantity) + p.bottles,
      available: p.available,
      mrp: p.mrp
    })));
    
    try {
      console.log(`\n🔍 [${requestId}] ===== VALIDATION PHASE =====`);
      
      // Validation
      if (!selectedSupplier) {
        console.log(`❌ [${requestId}] Validation failed: No supplier selected`);
        setError('Please select a supplier');
        return;
      }
      console.log(`✅ [${requestId}] Supplier validation passed:`, selectedSupplier);

      if (selectedProducts.length === 0) {
        console.log(`❌ [${requestId}] Validation failed: No products selected`);
        setError('Please add at least one product');
        return;
      }
      console.log(`✅ [${requestId}] Products validation passed: ${selectedProducts.length} products selected`);

      // Business rules temporarily disabled - allow all operations

      const productsWithQuantity = selectedProducts.filter(p => (p.cases > 0 || p.bottles > 0));
      if (productsWithQuantity.length === 0) {
        console.log(`❌ [${requestId}] Validation failed: No quantities entered`);
        setError('Please enter quantities for the products');
        return;
      }
      console.log(`✅ [${requestId}] Quantity validation passed: ${productsWithQuantity.length} products with quantities`);

      // Debug: Log the selectedProducts state
      console.log(`📊 [${requestId}] Frontend - selectedProducts state:`, selectedProducts);
      console.log(`📊 [${requestId}] Frontend - productsWithQuantity:`, productsWithQuantity);
      
      // Additional validation for shift out
      if (shiftType === 'out') {
        console.log(`🔍 [${requestId}] Shift Out validation - checking stock availability`);
        const stockErrors = Object.keys(rowErrors);
        if (stockErrors.length > 0) {
          console.log(`❌ [${requestId}] Stock validation failed:`, rowErrors);
          setError('Insufficient stock for some products');
          return;
        }
        console.log(`✅ [${requestId}] Stock validation passed: All products have sufficient stock`);
      }

      console.log(`\n🔄 [${requestId}] ===== PROCESSING PHASE =====`);
      setLoading(true);
      setError('');

      const token = localStorage.getItem('token');
      const currentShop = getCurrentShopFromJWT();
      
      console.log(`🔑 [${requestId}] Authentication details:`, {
        tokenExists: !!token,
        currentShop: currentShop,
        shopName: getShopNameForDisplay()
      });

      console.log(`📦 [${requestId}] Processing ${productsWithQuantity.length} products for ${shiftType.toUpperCase()} operation`);

      // Process each product
      for (const product of productsWithQuantity) {
        const totalQuantity = (product.cases * product.packQuantity) + product.bottles;
        
        console.log(`\n🔍 [${requestId}] ===== PROCESSING PRODUCT ${productsWithQuantity.indexOf(product) + 1}/${productsWithQuantity.length} =====`);
        console.log(`📋 [${requestId}] Product Details:`, {
          id: product.id,
          name: product.name,
          brandNumber: product.brandNumber,
          shiftType: shiftType,
          totalQuantity: totalQuantity,
          cases: product.cases,
          bottles: product.bottles,
          packQuantity: product.packQuantity,
          available: product.available,
          mrp: product.mrp
        });
        
        // Determine if this is an internal shop transfer
        const isInternalTransfer = selectedSupplier?.startsWith('supplier_');
        const supplierInfo = suppliers.find(s => s.id === selectedSupplier);
        
        console.log(`🔍 [${requestId}] Transfer Type Analysis:`, {
          selectedSupplier: selectedSupplier,
          isInternalTransfer: isInternalTransfer,
          supplierInfo: supplierInfo,
          isFromTGBCL: selectedSupplier === 'tgbcl'
        });
        
        const shiftData = {
          ...(shiftType === 'out' 
            ? { shopInventoryId: product.id } 
            : (isInternalTransfer 
              ? { shopInventoryId: product.id }  // Internal shop: product.id is shopInventoryId
              : { masterBrandId: product.id }    // External/TGBCL: product.id is masterBrandId
            )
          ),
          quantity: shiftType === 'out' ? -totalQuantity : totalQuantity,
          supplierName: supplierInfo?.shop_name || 'Unknown',
          isFromTGBCL: selectedSupplier === 'tgbcl',
          supplierCode: selectedSupplier === 'tgbcl' ? 'TGBCL' : (supplierInfo?.retailer_code || null),
          supplierShopId: selectedSupplier?.startsWith('supplier_') ? parseInt(selectedSupplier.replace('supplier_','')) : null,
          shiftType: shiftType
        };
        
        console.log(`📤 [${requestId}] Frontend - Prepared shift data:`, {
          ...shiftData,
          quantitySign: shiftType === 'out' ? 'NEGATIVE (outgoing)' : 'POSITIVE (incoming)',
          productIdentifier: shiftType === 'out' ? 'shopInventoryId' : (isInternalTransfer ? 'shopInventoryId' : 'masterBrandId'),
          transferDirection: shiftType === 'out' ? 'FROM current shop TO destination' : 'FROM source TO current shop'
        });

        console.log(`🌐 [${requestId}] Frontend - Making API call to /api/stock-shift`);
        console.log(`📡 [${requestId}] API Request Details:`, {
          url: `${API_BASE_URL}/api/stock-shift`,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token ? token.substring(0, 20) + '...' : 'NO_TOKEN'}`,
            'Content-Type': 'application/json'
          },
          body: shiftData
        });
        
        const response = await fetch(`${API_BASE_URL}/api/stock-shift`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(shiftData)
        });

        console.log(`📡 [${requestId}] Frontend - API response received:`, {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries())
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          console.log(`❌ [${requestId}] Frontend - API error response:`, {
            status: response.status,
            errorData: errorData,
            productId: product.id,
            productName: product.name
          });
          throw new Error(errorData.message || 'Failed to process shift');
        }

        const result = await response.json();
        console.log(`✅ [${requestId}] Frontend - Shift successful for product:`, {
          productId: product.id,
          productName: product.name,
          result: result
        });
      }

      console.log(`\n🎉 [${requestId}] ===== SHIFT TRANSFER COMPLETED SUCCESSFULLY =====`);
      console.log(`✅ [${requestId}] All ${productsWithQuantity.length} products processed successfully`);
      setSuccess('Stock successfully shifted.');
      
      // Reset form
      console.log(`🔄 [${requestId}] Resetting form state`);
      setSelectedProducts([]);
      setSelectedSupplier('');
      setSearchTerm('');
      
    } catch (error) {
      console.log(`\n❌ [${requestId}] ===== SHIFT TRANSFER FAILED =====`);
      console.error(`💥 [${requestId}] Error confirming shift:`, {
        error: error,
        message: error.message,
        stack: error.stack,
        requestId: requestId
      });
      setError(error.message || 'Failed to process shift');
    } finally {
      console.log(`🏁 [${requestId}] ===== SHIFT TRANSFER OPERATION ENDED =====`);
      setLoading(false);
    }
  };

  return (
    <div className="shift-transfer-container">
      <header className="shift-transfer-header">
        <div className="logo-section">
          <h1 className="app-title">{shopName}</h1>
          <p className="app-subtitle">Stock Transfer Management</p>
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

      <main className="shift-transfer-content">
        <div className="page-title-section">
          <h2 className="main-title">Stock Transfer</h2>
          <p className="subtitle">Manage stock movements and transfers</p>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {success && (
          <div className="success-message">
            {success}
          </div>
        )}

        <div className="transfer-details-container">

          {/* Transfer (segmented) */}
          <div className="transfer-section">
            <h3 className="transfer-section-title">Transfer</h3>
            <div className="radio-buttons-container">
              <label className="radio-button-option">
                <input
                  type="radio"
                  name="shiftType"
                  value="in"
                  checked={shiftType === 'in'}
                  onChange={(e) => setShiftType(e.target.value)}
                />
                <span className="radio-button-label">Shift In</span>
              </label>
              <label className="radio-button-option">
                <input
                  type="radio"
                  name="shiftType"
                  value="out"
                  checked={shiftType === 'out'}
                  onChange={(e) => setShiftType(e.target.value)}
                />
                <span className="radio-button-label">Shift Out</span>
              </label>
            </div>
          </div>

          {/* Select Supplier */}
          <div className="transfer-section">
            <h3 className="transfer-section-title">Select Supplier</h3>
            <select
              className="transfer-supplier-select"
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
            >
              <option value="">Choose a supplier...</option>
              {(() => {
                // Business rules for supplier selection
                if (shiftType === 'out') {
                  // Shift Out: Can transfer TO internal and external shops (exclude TGBCL)
                  return suppliers.filter(s => s.id !== 'tgbcl').map(supplier => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.shop_name} {supplier.retailer_code !== supplier.shop_name ? `(${supplier.retailer_code})` : ''}
                    </option>
                  ));
                } else {
                  // Shift In: Can receive FROM both external and internal shops
                  // External shops: You can raise the request
                  // Internal shops: You can see them but cannot raise request (other shop must initiate Shift Out)
                  return suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.shop_name} {supplier.retailer_code !== supplier.shop_name ? `(${supplier.retailer_code})` : ''}
                    </option>
                  ));
                }
              })()}
            </select>
          </div>

          {/* Product Search */}
          <div className="transfer-section">
            <h3 className="transfer-section-title">Product Search</h3>
            <div className="transfer-search-container" ref={searchContainerRef}>
              <div className="search-input-wrapper">
                <span className="search-icon">🔍</span>
                <input
                  ref={searchInputRef}
                  type="text"
                  className="transfer-product-search"
                  placeholder="Search by brand number, brand name..."
                  value={searchTerm}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyPress}
                  onFocus={() => searchTerm.trim().length >= MIN_SEARCH_LENGTH && setShowSearchResults(true)}
                />
              </div>
              
              {showSearchResults && searchResults.length > 0 && (
                <div className="transfer-search-results">
                  {searchResults.map(brand => (
                    <div
                      key={brand.id}
                      className="transfer-search-result-item"
                      onClick={() => handleBrandSelect(brand)}
                    >
                      <div className="brand-info">
                        <div className="brand-name">{brand.brand_name || brand.name}</div>
                        <div className="brand-details">
                          {`Brand #${brand.brand_number || brand.brandNumber} • ${(brand.sizeMl || brand.size_ml || brand.size)} ml`}
                          {(brand.packType || brand.pack_type) ? <>{` • ${brand.packType || brand.pack_type}`}</> : null}
                          {` • ₹${brand.standard_mrp ?? brand.mrp}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Selected Products or Empty State */}
          {selectedProducts.length === 0 ? (
            <div className="empty-products-state">
              <div className="empty-icon">🧳</div>
              <h4 className="empty-title">Add products to initiate transfer</h4>
              <p className="empty-subtitle">Use the Product Search above to find and add brands</p>
            </div>
          ) : (
            <div className="form-section">
              <h3 className="section-title">Selected Products</h3>
              <div className="products-table-container">
                <table className="products-table">
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Brand name</th>
                      <th>Size</th>
                      <th colSpan="2">Quantity</th>
                      <th>M.R.P</th>
                    </tr>
                    <tr className="sub-header">
                      <th></th>
                      <th></th>
                      <th></th>
                      <th>Cases</th>
                      <th>Bottles</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedProducts.map((product, index) => (
                      <React.Fragment key={product.id}>
                      <tr>
                        <td>{index + 1}</td>
                        <td className="product-name">
                          {product.name} {product.brandNumber ? `(${product.brandNumber})` : ''}
                          <button
                            className="row-action-btn danger"
                            onClick={() => openRemoveConfirm(product)}
                            title="Remove product"
                            aria-label={`Remove ${product.name}`}
                          >
                            Remove
                          </button>
                        </td>
                        <td>{product.packQuantity} × {product.sizeMl} ml</td>
                        <td className={rowErrors[product.id] ? 'row-error' : ''}>
                          <input
                            type="number"
                            min="0"
                            className="quantity-input"
                            placeholder="0"
                            value={product.cases === 0 ? '' : product.cases}
                            onWheel={(e) => e.currentTarget.blur()}
                            onFocus={(e) => e.target.select()}
                            onBlur={() => validateAndMark(product.id)}
                            onChange={(e) => handleCasesChange(product.id, e.target.value)}
                          />
                        </td>
                        <td className={rowErrors[product.id] ? 'row-error' : ''}>
                          <input
                            type="number"
                            min="0"
                            className="quantity-input"
                            placeholder="0"
                            value={product.bottles === 0 ? '' : product.bottles}
                            onWheel={(e) => e.currentTarget.blur()}
                            onFocus={(e) => e.target.select()}
                            onBlur={() => validateAndMark(product.id)}
                            onChange={(e) => handleBottlesChange(product.id, e.target.value)}
                          />
                          <div className="available-bottles-display">
                            Available: {(() => {
                              // Get available quantity for this product
                              let available = 0;
                              
                              if (shiftType === 'out') {
                                // For shift out, get from current shop's inventory
                                const match = shopProductsCache.find(sp => {
                                  const bn = sp.brand_number || sp.brandNumber;
                                  const bnP = product.brandNumber;
                                  const sz = Number(sp.size_ml || sp.size || 0);
                                  const szP = Number(product.sizeMl || 0);
                                  return bn && bnP && String(bn) === String(bnP) && sz === szP;
                                });
                                available = Number((product.available || 0) || ((match && ((match.closingStock ?? match.closing_stock) ?? (match.totalStock ?? match.total_stock) ?? (match.quantity ?? match.current_quantity))) || 0));
                                console.log('🔍 Shift Out - Available calculation:', {
                                  productId: product.id,
                                  productAvailable: product.available,
                                  matchFound: !!match,
                                  matchAvailable: match ? (match.closingStock ?? match.closing_stock) ?? (match.totalStock ?? match.total_stock) ?? (match.quantity ?? match.current_quantity) : null,
                                  finalAvailable: available
                                });
                              } else {
                                // For shift in, get from selected supplier's inventory
                                available = Number(product.available || 0);
                                console.log('🔍 Shift In - Available calculation:', {
                                  productId: product.id,
                                  productAvailable: product.available,
                                  finalAvailable: available
                                });
                              }
                              
                              return isNaN(available) ? 0 : available;
                            })()}
                          </div>
                        </td>
                        <td>{formatINR(product.mrp)}</td>
                      </tr>
                      {rowErrors[product.id] && (
                        <tr>
                          <td></td>
                          <td colSpan="4">
                            <div className="row-error-hint">Insufficient stock. {rowErrors[product.id]}</div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="actions-row">
            <button
              type="button"
              className="btn-cancel"
              onClick={() => {
                setSelectedProducts([]);
                setSearchTerm('');
              }}
            >
              Cancel
            </button>
            {/** compute enablement based on quantities and shift type */}
            <button
              className="btn-confirm"
              onClick={handleConfirmShift}
              disabled={
                loading ||
                !selectedSupplier ||
                selectedProducts.length === 0 ||
                !selectedProducts.some(p => (p.cases > 0 || p.bottles > 0)) ||
                (shiftType === 'out' && Object.keys(rowErrors).length > 0)
              }
            >
              {loading ? 'Processing...' : 'Confirm Stock Transfer'}
            </button>
          </div>
        </div>
      </main>
      {removeTarget && (
        <div className="modal-backdrop" onClick={closeRemoveConfirm}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="remove-title">
            <h4 id="remove-title" className="modal-title">Remove product?</h4>
            <p className="modal-text">
              {removeTarget.name} {removeTarget.brandNumber ? `(${removeTarget.brandNumber})` : ''}
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={closeRemoveConfirm}>Cancel</button>
              <button className="btn-danger" onClick={confirmRemove}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ShiftTransfer;