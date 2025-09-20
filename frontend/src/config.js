const API_BASE_URL = process.env.REACT_APP_API_URL || 
  (process.env.NODE_ENV === 'production' 
    ? 'https://api.easysheetsdaily.com'
    : 'http://localhost:3001');
export default API_BASE_URL;
