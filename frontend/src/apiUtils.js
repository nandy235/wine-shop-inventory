/**
 * Secure API Utilities - Production Ready Cookie-based Authentication
 * Robust implementation with proper error handling and no hard-coded redirects
 */

import API_BASE_URL from './config';

// Rate limiting protection for refresh calls
let refreshInProgress = false;

// CSRF token storage
let csrfToken = null;

/**
 * Set CSRF token for API calls
 */
export const setCSRFToken = (token) => {
  csrfToken = token;
};

/**
 * Get current CSRF token
 */
export const getCSRFToken = () => {
  return csrfToken;
};

/**
 * Handle token refresh with rate limiting protection
 */
const handleTokenRefresh = async () => {
  if (refreshInProgress) {
    // Wait for existing refresh to complete
    return false;
  }
  
  refreshInProgress = true;
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include'
    });
    
    return response.ok;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return false;
  } finally {
    refreshInProgress = false;
  }
};

/**
 * Secure API call wrapper with timeout and retry logic
 * Properly separates auth retries from network retries
 */
export const secureApiCall = async (endpoint, options = {}, retryCount = 0, maxRetries = 1, authRetried = false) => {
  // Setup request timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
  
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      signal: controller.signal,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
        ...options.headers
      }
    });
    
    clearTimeout(timeoutId);
    
    // Handle auth errors - only retry once per request chain
    if (response.status === 401 && !authRetried) {
      const refreshSuccess = await handleTokenRefresh();
      if (refreshSuccess) {
        // Reset retryCount but mark auth as retried to prevent auth retry loops
        return secureApiCall(endpoint, options, 0, maxRetries, true);
      }
    }
    
    return response;
  } catch (networkError) {
    clearTimeout(timeoutId);
    
    // Retry for network errors (not timeouts, not if auth was already retried)
    if (retryCount < maxRetries && networkError.name !== 'AbortError') {
      console.warn(`Network error, retrying... (${retryCount + 1}/${maxRetries + 1})`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      return secureApiCall(endpoint, options, retryCount + 1, maxRetries, authRetried);
    }
    
    // Handle different error types
    if (networkError.name === 'AbortError') {
      throw new Error('Request timeout - please check your connection');
    }
    
    throw new Error(`Network error: ${networkError.message}`);
  }
};

/**
 * Common API methods
 */
export const apiGet = async (endpoint) => {
  return secureApiCall(endpoint, { method: 'GET' });
};

export const apiPost = async (endpoint, data) => {
  return secureApiCall(endpoint, {
    method: 'POST',
    body: JSON.stringify(data)
  });
};

export const apiPut = async (endpoint, data) => {
  return secureApiCall(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
};

export const apiDelete = async (endpoint) => {
  return secureApiCall(endpoint, { method: 'DELETE' });
};

/**
 * File upload with timeout, retry logic, and proper error handling
 * Properly separates auth retries from network retries
 */
export const secureFileUpload = async (endpoint, formData, retryCount = 0, maxRetries = 1, authRetried = false) => {
  // Longer timeout for file uploads
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout for uploads
  
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      signal: controller.signal,
      credentials: 'include',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken })
        // No Authorization header - cookies handle auth
        // No Content-Type - let browser set it for FormData
      },
      body: formData
    });
    
    clearTimeout(timeoutId);
    
    // Handle auth errors - only retry once per upload chain
    if (response.status === 401 && !authRetried) {
      const refreshSuccess = await handleTokenRefresh();
      if (refreshSuccess) {
        // Reset retryCount but mark auth as retried
        return secureFileUpload(endpoint, formData, 0, maxRetries, true);
      }
    }
    
    return response;
  } catch (networkError) {
    clearTimeout(timeoutId);
    
    // Retry for network errors (not for timeouts on uploads - files might be large)
    if (retryCount < maxRetries && networkError.name !== 'AbortError') {
      console.warn(`File upload failed, retrying... (${retryCount + 1}/${maxRetries + 1})`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay for uploads
      return secureFileUpload(endpoint, formData, retryCount + 1, maxRetries, authRetried);
    }
    
    if (networkError.name === 'AbortError') {
      throw new Error('File upload timeout - please try again with a smaller file');
    }
    
    throw new Error(`File upload network error: ${networkError.message}`);
  }
};

/**
 * Get CSRF token from server
 */
export const getCSRFTokenFromServer = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/csrf-token`, {
      credentials: 'include'
    });
    if (response.ok) {
      const data = await response.json();
      return data.csrfToken;
    }
    return null;
  } catch (error) {
    console.error('Failed to get CSRF token:', error);
    return null;
  }
};

/**
 * Check authentication status - returns boolean, no redirects
 */
export const checkAuthStatus = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/status`, {
      credentials: 'include'
    });
    return response.ok;
  } catch (error) {
    console.error('Auth check failed:', error);
    return false;
  }
};

/**
 * Logout - returns success/failure status, no redirects
 */
export const logout = async () => {
  try {
    const csrfToken = getCSRFToken();
    const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken })
      }
    });
    return response.ok;
  } catch (error) {
    console.error('Logout error:', error);
    return false;
  }
};

/**
 * Authentication error types for better error handling
 */
export const AuthErrorTypes = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  SERVER_ERROR: 'SERVER_ERROR'
};

/**
 * Enhanced API call with detailed error information
 */
export const apiCallWithErrorInfo = async (endpoint, options = {}) => {
  try {
    const response = await secureApiCall(endpoint, options);
    
    if (!response.ok) {
      let errorType;
      switch (response.status) {
        case 401:
          errorType = AuthErrorTypes.UNAUTHORIZED;
          break;
        case 403:
          errorType = AuthErrorTypes.FORBIDDEN;
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          errorType = AuthErrorTypes.SERVER_ERROR;
          break;
        default:
          errorType = 'HTTP_ERROR';
      }
      
      return {
        success: false,
        error: errorType,
        status: response.status,
        response: response
      };
    }
    
    return {
      success: true,
      response: response
    };
  } catch (error) {
    return {
      success: false,
      error: AuthErrorTypes.NETWORK_ERROR,
      message: error.message
    };
  }
};