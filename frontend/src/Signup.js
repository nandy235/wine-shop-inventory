import React, { useState } from 'react';
import './Signup.css';
import { apiPost } from './apiUtils';
import { validateEmail, sanitizeRetailerCode, validateRetailerCode, sanitizeInput } from './authUtils';

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
    setLoading(true);
    setError('');
    
    // Client-side validation
    const cleanName = sanitizeInput(name);
    const cleanEmail = email.trim();
    const cleanShopName = sanitizeInput(shopName);
    const cleanRetailerCode = sanitizeRetailerCode(retailerCode);
    const cleanAddress = sanitizeInput(address);
    const cleanLicenseNumber = sanitizeInput(licenseNumber);
    
    // Validation checks
    if (!cleanName) {
      setError('Name is required');
      setLoading(false);
      return;
    }
    
    if (!validateEmail(cleanEmail)) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }
    
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }
    
    if (!cleanShopName) {
      setError('Shop name is required');
      setLoading(false);
      return;
    }
    
    if (!validateRetailerCode(cleanRetailerCode)) {
      setError('Retailer code must be exactly 7 digits');
      setLoading(false);
      return;
    }

    try {
      await apiPost('/api/register', { 
        name: cleanName, 
        email: cleanEmail, 
        password, 
        shopName: cleanShopName, 
        retailerCode: cleanRetailerCode, 
        address: cleanAddress, 
        licenseNumber: cleanLicenseNumber 
      });

      alert('Account created successfully! Please login.');
      onLogin();
    } catch (err) {
      setError(err.message || 'Network error. Please try again.');
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
            type="text" 
            className="form-input" 
            value={retailerCode}
            onChange={(e) => {
              const value = sanitizeRetailerCode(e.target.value);
              if (value.length <= 7) {
                setRetailerCode(value);
              }
            }}
            placeholder="7-digit number (e.g., 1234567)"
            maxLength="7"
            pattern="[0-9]{7}"
            inputMode="numeric"
            required
            style={{
              MozAppearance: 'textfield',
              WebkitAppearance: 'none',
              appearance: 'none'
            }}
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
          <label className="form-label">License Number:</label>
          <input 
            type="text" 
            className="form-input" 
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            placeholder="Wine shop license number (optional)"
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
