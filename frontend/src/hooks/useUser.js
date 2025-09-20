/**
 * User Data Hook
 * Fetches user data from server when needed with proper error handling
 */

import { useState, useEffect } from 'react';
import { apiGet } from '../apiUtils';

export const useUser = (isAuthenticated, onAuthError) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
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
          // Authentication expired
          if (onAuthError) {
            onAuthError();
          }
          setUser(null);
        } else {
          setError(`Failed to fetch user data: HTTP ${response.status}`);
          setUser(null);
        }
      } catch (err) {
        console.error('Failed to fetch user data:', err);
        setError(err.message || 'Network error');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [isAuthenticated, onAuthError]);

  return { user, loading, error };
};
