import React, { useState } from 'react';
import './Signup.css';
import API_BASE_URL from './config';

function Signup({ onLogin }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shopName, setShopName] = useState('');
  const [retailerCode, setRetailerCode] = useState('');
  const [address, setAddress] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
  console.log('API_BASE_URL:', API_BASE_URL, typeof API_BASE_URL);
  console.log('Full URL:', `${API_BASE_URL}/api/register`);
  
  setLoading(true);
  setError('');
  

    try {
      const response = await fetch(`${API_BASE_URL}/api/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          name, 
          email, 
          password, 
          shopName, 
          retailerCode, 
          address, 
          licenseNumber 
        })
      });

      const data = await response.json();

      if (response.ok) {
        alert('Account created successfully! Please login.');
        onLogin();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Network error. Please try again.');
    }

    setLoading(false);
  };

  return (
    <div className="signup-container">
      <div className="signup-form">
        <h1 className="signup-title">Create Account</h1>
        {error && <div style={{color: 'red', marginBottom: '10px'}}>{error}</div>}
        <div className="form-group">
          <label className="form-label">Name:</label>
          <input 
            type="text" 
            className="form-input" 
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Email:</label>
          <input 
            type="email" 
            className="form-input" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
        <div className="form-group">
          <label className="form-label">Shop Name:</label>
          <input 
            type="text" 
            className="form-input" 
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Retailer Code: *</label>
          <input 
            type="number" 
            className="form-input" 
            value={retailerCode}
            onChange={(e) => {
              const value = e.target.value;
              if (value.length <= 6) {
                setRetailerCode(value);
              }
            }}
            placeholder="6-digit number (e.g., 123456)"
            maxLength="6"
            min="100000"
            max="999999"
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Shop Address:</label>
          <textarea 
            className="form-input" 
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows="3"
            placeholder="Complete shop address"
          />
        </div>
        <div className="form-group">
          <label className="form-label">License Number: *</label>
          <input 
            type="text" 
            className="form-input" 
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            placeholder="Wine shop license number (required for login)"
            required
          />
        </div>
        <button 
          className="signup-button" 
          onClick={handleSignup}
          disabled={loading}
        >
          {loading ? 'Creating Account...' : 'Sign Up'}
        </button>
        <p className="login-text">
          Already have an account? 
          <a href="#" className="login-link" onClick={(e) => { e.preventDefault(); onLogin(); }}>
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}

export default Signup;
