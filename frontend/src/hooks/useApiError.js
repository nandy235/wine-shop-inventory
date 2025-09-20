/**
 * API Error Handling Hook
 * Centralized error handling for API calls with authentication awareness
 */

import { useState, useCallback } from 'react';
import { AuthErrorTypes } from '../apiUtils';

export const useApiError = (onAuthError) => {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleApiCall = useCallback(async (apiFunction, ...args) => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiFunction(...args);
      
      // Handle enhanced API calls with error info
      if (result && typeof result === 'object' && 'success' in result) {
        if (!result.success) {
          if (result.error === AuthErrorTypes.UNAUTHORIZED && onAuthError) {
            onAuthError();
            return null;
          }
          
          setError({
            type: result.error,
            message: result.message || 'API call failed',
            status: result.status
          });
          return null;
        }
        return result.response;
      }
      
      // Handle regular fetch responses
      if (result && result.status) {
        if (result.status === 401 && onAuthError) {
          onAuthError();
          return null;
        }
        
        if (!result.ok) {
          setError({
            type: 'HTTP_ERROR',
            message: `HTTP ${result.status}`,
            status: result.status
          });
          return null;
        }
      }
      
      return result;
    } catch (err) {
      setError({
        type: AuthErrorTypes.NETWORK_ERROR,
        message: err.message || 'Network error occurred'
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [onAuthError]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    error,
    loading,
    handleApiCall,
    clearError
  };
};
