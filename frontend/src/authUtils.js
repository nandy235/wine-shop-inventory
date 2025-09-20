/**
 * Authentication Utilities - Display Data Only
 * No token management - server handles all authentication via cookies
 */

// Keys for non-sensitive display data only
const USER_DISPLAY_KEY = 'user_display_data';

/**
 * Simple obfuscation for localStorage data (basic protection)
 */
const obfuscate = (data) => {
  return btoa(JSON.stringify(data));
};

const deobfuscate = (data) => {
  try {
    return JSON.parse(atob(data));
  } catch {
    return null;
  }
};

/**
 * Store non-sensitive user display data only
 * No tokens, no sensitive information
 */
export const setUserDisplayData = (userData) => {
  if (!userData) return;
  
  // Only store non-sensitive display data
  const safeUserData = {
    shopName: userData.shopName || '',
    email: userData.email || '',
    retailerCode: userData.retailerCode || '',
    name: userData.name || ''
  };
  
  try {
    localStorage.setItem(USER_DISPLAY_KEY, obfuscate(safeUserData));
  } catch (error) {
    console.error('Failed to store user display data:', error);
  }
};

/**
 * Get user display data (non-sensitive only)
 */
export const getUserDisplayData = () => {
  try {
    const stored = localStorage.getItem(USER_DISPLAY_KEY);
    return stored ? deobfuscate(stored) : {};
  } catch (error) {
    console.error('Failed to retrieve user display data:', error);
    return {};
  }
};

/**
 * Clear all local data
 */
export const clearLocalData = () => {
  try {
    localStorage.removeItem(USER_DISPLAY_KEY);
    // Clean up any legacy data
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
  } catch (error) {
    console.error('Failed to clear local data:', error);
  }
};

/**
 * Input sanitization utilities (for display purposes only)
 */
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') {
    return input;
  }
  
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .trim()
    .substring(0, 1000); // Limit length
};

export const sanitizeRetailerCode = (code) => {
  if (!code) return '';
  return code.replace(/\D/g, '').substring(0, 7);
};

/**
 * Client-side validation (UX only - server does real validation)
 */
export const validateRetailerCode = (code) => {
  return /^\d{7}$/.test(code);
};

export const validateEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/**
 * Get current user display info
 * Note: This is display data only - server verifies actual authentication
 */
export const getCurrentUser = () => {
  return getUserDisplayData();
};