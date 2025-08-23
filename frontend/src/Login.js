import React, { useState } from 'react';
import './Login.css';
import API_BASE_URL from './config';

function Login({ onLogin, onSignup }) {
  const [licenseNumber, setLicenseNumber] = useState('');
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
        body: JSON.stringify({ licenseNumber, password })
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
          <label className="form-label">License Number:</label>
          <input 
            type="text" 
            className="form-input" 
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            placeholder="Enter your wine shop license number"
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