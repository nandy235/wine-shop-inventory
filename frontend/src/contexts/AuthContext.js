import React, { createContext, useContext, useState, useEffect } from 'react';
import { checkAuthStatus, logout, setCSRFToken, getCSRFTokenFromServer } from '../apiUtils';
import { setUserDisplayData, clearLocalData } from '../authUtils';
import API_BASE_URL from '../config';

const AuthContext = createContext();

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const checkAuthStatusOnLoad = async () => {
    setLoading(true);
    setError(null);

    try {
      const isAuth = await checkAuthStatus();
      if (isAuth) {
        // Get CSRF token if authenticated
        const token = await getCSRFTokenFromServer();
        if (token) {
          setCSRFToken(token);
        }
      }
      setIsAuthenticated(isAuth);
    } catch (error) {
      console.error('Auth check failed:', error);
      setIsAuthenticated(false);
      setError('Failed to verify authentication status');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (credentials) => {
    if (!credentials) {
      return { success: false, error: 'Credentials are required' };
    }

    try {
      // Actually perform the login with credentials
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials)
      });
      
      if (response.ok) {
        const userData = await response.json();
        
        // Store CSRF token for API calls
        if (userData.csrfToken) {
          setCSRFToken(userData.csrfToken);
        }
        
        // Store user display data locally for better UX
        if (userData && userData.user) {
          setUserDisplayData(userData.user);
        }
        
        // Verify authentication was successful
        const isAuth = await checkAuthStatus();
        setIsAuthenticated(isAuth);
        return { success: isAuth };
      } else {
        const data = await response.json();
        return { success: false, error: data.message || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const handleLogout = async () => {
    const logoutSuccess = await logout();
    
    // Clear all local user data
    clearLocalData();
    setIsAuthenticated(false);
    
    if (!logoutSuccess) {
      console.warn('Logout API failed, but client state cleared');
    }
    
    return logoutSuccess;
  };

  const handleAuthError = () => {
    console.warn('Authentication expired - logging out');
    clearLocalData();
    setIsAuthenticated(false);
  };

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatusOnLoad();
  }, []);

  // Add session validation on window focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && isAuthenticated) {
        // Re-validate session when user returns to tab
        checkAuthStatusOnLoad();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isAuthenticated]);

  const contextValue = {
    isAuthenticated,
    loading,
    error,
    handleLogin,
    handleLogout,
    handleAuthError,
    checkAuthStatusOnLoad
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
