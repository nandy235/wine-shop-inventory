import React, { useState } from 'react';
import './Login.css';
import { sanitizeRetailerCode, validateRetailerCode } from './authUtils';

function Login({ onLogin, onSignup }) {
  console.log('Login component rendered');
  
  const [retailerCode, setRetailerCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Refs to access input values directly (for auto-fill detection)
  const retailerCodeRef = React.useRef(null);
  const passwordRef = React.useRef(null);

  // Effect to detect auto-fill and update state
  React.useEffect(() => {
    const checkAutoFill = () => {
      if (retailerCodeRef.current?.value !== retailerCode) {
        const sanitized = sanitizeRetailerCode(retailerCodeRef.current?.value || '');
        setRetailerCode(sanitized);
      }
      if (passwordRef.current?.value !== password) {
        setPassword(passwordRef.current?.value || '');
      }
    };

    // Check immediately
    checkAutoFill();

    // Check periodically for auto-fill
    const interval = setInterval(checkAutoFill, 50);

    // Cleanup after 5 seconds (auto-fill usually happens quickly)
    const timeout = setTimeout(() => {
      clearInterval(interval);
    }, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [retailerCode, password]);

  // Additional event listeners for auto-fill detection
  React.useEffect(() => {
    const handleAutoFill = () => {
      if (retailerCodeRef.current?.value) {
        const sanitized = sanitizeRetailerCode(retailerCodeRef.current.value);
        setRetailerCode(sanitized);
      }
      if (passwordRef.current?.value) {
        setPassword(passwordRef.current.value);
      }
    };

    // Listen for various auto-fill events
    document.addEventListener('animationstart', handleAutoFill);
    document.addEventListener('input', handleAutoFill);
    
    return () => {
      document.removeEventListener('animationstart', handleAutoFill);
      document.removeEventListener('input', handleAutoFill);
    };
  }, []);

  // Add event listeners directly to input elements
  React.useEffect(() => {
    const retailerInput = retailerCodeRef.current;
    const passwordInput = passwordRef.current;

    const handleInputChange = () => {
      if (retailerInput?.value) {
        const sanitized = sanitizeRetailerCode(retailerInput.value);
        setRetailerCode(sanitized);
      }
      if (passwordInput?.value) {
        setPassword(passwordInput.value);
      }
    };

    if (retailerInput) {
      retailerInput.addEventListener('input', handleInputChange);
      retailerInput.addEventListener('change', handleInputChange);
    }
    if (passwordInput) {
      passwordInput.addEventListener('input', handleInputChange);
      passwordInput.addEventListener('change', handleInputChange);
    }

    return () => {
      if (retailerInput) {
        retailerInput.removeEventListener('input', handleInputChange);
        retailerInput.removeEventListener('change', handleInputChange);
      }
      if (passwordInput) {
        passwordInput.removeEventListener('input', handleInputChange);
        passwordInput.removeEventListener('change', handleInputChange);
      }
    };
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setError('');

    // Get values from refs (for auto-fill) or state
    const currentRetailerCode = retailerCodeRef.current?.value || retailerCode;
    const currentPassword = passwordRef.current?.value || password;
    
    // Debug logging
    console.log('Login attempt:', {
      stateRetailerCode: retailerCode,
      refRetailerCode: retailerCodeRef.current?.value,
      currentRetailerCode,
      statePassword: password,
      refPassword: passwordRef.current?.value,
      currentPassword
    });

    // Client-side validation
    const cleanRetailerCode = sanitizeRetailerCode(currentRetailerCode);
    if (!validateRetailerCode(cleanRetailerCode)) {
      setError('Retailer code must be exactly 7 digits');
      setLoading(false);
      return;
    }

    if (!currentPassword || currentPassword.length < 1) {
      setError('Password is required');
      setLoading(false);
      return;
    }

    try {
      // Pass credentials to AuthContext for actual login
      const loginResult = await onLogin({
        retailerCode: cleanRetailerCode,
        password: currentPassword.trim()
      });
      
      if (!loginResult.success) {
        setError(loginResult.error || 'Login failed');
      }
      // If successful, AuthContext handles authentication state
    } catch (err) {
      console.error('Login error:', err);
      setError('Network error. Please try again.');
    }

    setLoading(false);
  };

  // Handle form submission for better accessibility
  const handleSubmit = (e) => {
    console.log('Form submit triggered');
    e.preventDefault();
    if (!loading) {
      handleLogin();
    }
  };

  // Keyboard accessibility - Enter key to login (using modern onKeyDown)
  const handleKeyDown = (e) => {
    console.log('Key pressed:', e.key, 'KeyCode:', e.keyCode, 'Which:', e.which);
    if ((e.key === 'Enter' || e.key === 'Unidentified' || e.keyCode === 13 || e.which === 13) && !loading) {
      console.log('Enter key detected, calling handleLogin');
      e.preventDefault();
      handleLogin();
    }
  };

  return (
    <div className="login-container">
      <div className="login-form">
        <h1 className="login-title">Liquor Ledger</h1>
        {error && <div style={{color: 'red', marginBottom: '10px'}} role="alert">{error}</div>}
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
          <label className="form-label">Retailer Code:</label>
          <input 
            ref={retailerCodeRef}
            type="text" 
            className="form-input" 
            value={retailerCode}
            onChange={(e) => {
              const sanitized = sanitizeRetailerCode(e.target.value);
              setRetailerCode(sanitized);
            }}
            onKeyDown={handleKeyDown}
            placeholder="7-digit number (e.g., 1234567)"
            maxLength="7"
            pattern="[0-9]{7}"
            inputMode="numeric"
            disabled={loading}
            style={{
              MozAppearance: 'textfield',
              WebkitAppearance: 'none',
              appearance: 'none'
            }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Password:</label>
          <input 
            ref={passwordRef}
            type="password" 
            className="form-input" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter your password"
            disabled={loading}
          />
          </div>
          <button 
            type="submit"
            className="signin-button" 
            disabled={loading}
            aria-label={loading ? 'Signing in, please wait' : 'Sign in to your account'}
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
        <p className="signup-text">
          New user? 
          <a href="#" className="signup-link" onClick={(e) => { e.preventDefault(); onSignup(); }}>
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}

export default Login;