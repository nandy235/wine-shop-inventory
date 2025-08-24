import React, { useState } from 'react';
import './Login.css';
import API_BASE_URL from './config';

function Login({ onLogin, onSignup }) {
  const [retailerCode, setRetailerCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ retailerCode, password })
      });

      const data = await response.json();

      if (response.ok) {
        onLogin(data.token, data.user);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Network error. Please try again.');
    }

    setLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-form">
        <h1 className="login-title">Liquor Ledger</h1>
        {error && <div style={{color: 'red', marginBottom: '10px'}}>{error}</div>}
        <div className="form-group">
          <label className="form-label">Retailer Code:</label>
          <input 
            type="text" 
            className="form-input" 
            value={retailerCode}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, ''); // Only allow digits
              if (value.length <= 6) {
                setRetailerCode(value);
              }
            }}
            placeholder="6-digit number (e.g., 123456)"
            maxLength="6"
            pattern="[0-9]{6}"
            inputMode="numeric"
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
          />
        </div>
        <button 
          className="signin-button" 
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? 'Signing In...' : 'Sign In'}
        </button>
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