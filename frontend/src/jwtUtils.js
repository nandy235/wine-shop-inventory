/**
 * JWT Utility Functions
 * Provides secure access to JWT token data for shop identification
 */

/**
 * Parse JWT token and extract payload data
 * @param {string} token - JWT token from localStorage
 * @returns {object|null} - Parsed payload or null if invalid
 */
export const parseJWTPayload = (token) => {
  if (!token) {
    console.warn('No JWT token provided');
    return null;
  }

  try {
    // JWT structure: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('Invalid JWT token format');
      return null;
    }

    // Decode the payload (base64)
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch (error) {
    console.error('Error parsing JWT token:', error);
    return null;
  }
};

/**
 * Get current shop data from JWT token
 * @returns {object} - Shop data with shopId, retailerCode, userId, email
 */
export const getCurrentShopFromJWT = () => {
  const token = localStorage.getItem('token');
  const payload = parseJWTPayload(token);
  
  if (!payload) {
    return {
      shopId: null,
      retailerCode: null,
      userId: null,
      email: null
    };
  }

  return {
    shopId: payload.shopId || null,
    retailerCode: payload.retailerCode || null,
    userId: payload.userId || null,
    email: payload.email || null
  };
};

/**
 * Get shop name from localStorage (for display purposes only)
 * @returns {string} - Shop name for display
 */
export const getShopNameForDisplay = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.shopName || 'Liquor Ledger';
  } catch (error) {
    console.error('Error getting shop name from localStorage:', error);
    return 'Liquor Ledger';
  }
};

/**
 * Check if user is authenticated (has valid token structure)
 * @returns {boolean} - True if token exists and has basic structure
 */
export const isAuthenticated = () => {
  const token = localStorage.getItem('token');
  const payload = parseJWTPayload(token);
  return payload && payload.shopId && payload.userId;
};
