import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiGet } from '../apiUtils';

const UserContext = createContext();

export const useUserContext = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUserContext must be used within a UserProvider');
  }
  return context;
};

export const UserProvider = ({ children, isAuthenticated, onAuthError }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchUserData = async () => {
    if (!isAuthenticated) {
      setUser(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiGet('/api/auth/me');

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else if (response.status === 401) {
        console.warn('User session expired while fetching user data');
        setUser(null);
        if (onAuthError) {
          onAuthError();
        }
      } else {
        const errorMsg = `Failed to fetch user data: HTTP ${response.status}`;
        console.error(errorMsg);
        setError(errorMsg);
        setUser(null);
      }
    } catch (err) {
      const errorMsg = err.message || 'Network error while fetching user data';
      console.error('Failed to fetch user data:', err);
      setError(errorMsg);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const clearUserData = () => {
    setUser(null);
    setError(null);
  };

  const refreshUserData = () => {
    fetchUserData();
  };

  // Fetch user data when authentication status changes
  useEffect(() => {
    fetchUserData();
  }, [isAuthenticated]);

  const contextValue = {
    user,
    loading,
    error,
    fetchUserData,
    clearUserData,
    refreshUserData,
    // Computed values for convenience
    shopName: user?.shopName || 'Wine Shop',
    userName: user?.name || 'User',
    userEmail: user?.email || '',
    retailerCode: user?.retailerCode || ''
  };

  return (
    <UserContext.Provider value={contextValue}>
      {children}
    </UserContext.Provider>
  );
};
