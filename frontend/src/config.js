const API_BASE_URL = process.env.REACT_APP_API_URL || 
  (process.env.NODE_ENV === 'production' 
    ? 'https://wine-shop-inventory-production.up.railway.app'
    : 'http://localhost:3001');
