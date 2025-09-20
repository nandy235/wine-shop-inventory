import React, { useState } from 'react';
import './Login.css';
import { sanitizeRetailerCode, validateRetailerCode } from './authUtils';

function Login({ onLogin, onSignup }) {
  const [retailerCode, setRetailerCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError('');

    // Client-side validation
    const cleanRetailerCode = sanitizeRetailerCode(retailerCode);
    if (!validateRetailerCode(cleanRetailerCode)) {
      setError('Retailer code must be exactly 7 digits');
      setLoading(false);
      return;
    }

    if (!password || password.length < 1) {
      setError('Password is required');
      setLoading(false);
      return;
    }

    try {
      // Pass credentials to AuthContext for actual login
      const loginResult = await onLogin({
        retailerCode: cleanRetailerCode,
        password: password.trim()
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

  // Keyboard accessibility - Enter key to login (using modern onKeyDown)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !loading) {
      handleLogin();
    }
  };

  // Handle form submission for better accessibility
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!loading) {
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