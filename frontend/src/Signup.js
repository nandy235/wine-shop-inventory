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
  const [passwordFocus, setPasswordFocus] = useState(false);

  // Password validation helper
  const getPasswordValidation = (pwd) => {
    return {
      length: pwd.length >= 8,
      lowercase: /(?=.*[a-z])/.test(pwd),
      uppercase: /(?=.*[A-Z])/.test(pwd),
      number: /(?=.*\d)/.test(pwd)
    };
  };

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
    
    // Enhanced password validation to match server requirements
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }
    
    if (!/(?=.*[a-z])/.test(password)) {
      setError('Password must contain at least one lowercase letter');
      setLoading(false);
      return;
    }
    
    if (!/(?=.*[A-Z])/.test(password)) {
      setError('Password must contain at least one uppercase letter');
      setLoading(false);
      return;
    }
    
    if (!/(?=.*\d)/.test(password)) {
      setError('Password must contain at least one number');
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
      const response = await apiPost('/api/register', { 
        name: cleanName, 
        email: cleanEmail, 
        password, 
        shopName: cleanShopName, 
        retailerCode: cleanRetailerCode, 
        address: cleanAddress, 
        licenseNumber: cleanLicenseNumber 
      });

      if (response.ok) {
        alert('Account created successfully! Please login.');
        onLogin();
      } else {
        // Handle HTTP error responses
        const errorData = await response.json();
        setError(errorData.message || `Registration failed (${response.status})`);
      }
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
            onFocus={() => setPasswordFocus(true)}
            onBlur={() => setPasswordFocus(false)}
            placeholder="Enter a strong password"
          />
          {(passwordFocus || password) && (
            <div style={{ 
              marginTop: '8px', 
              padding: '10px', 
              backgroundColor: '#f8f9fa', 
              border: '1px solid #e9ecef', 
              borderRadius: '4px',
              fontSize: '14px'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '5px', color: '#495057' }}>
                Password Requirements:
              </div>
              {(() => {
                const validation = getPasswordValidation(password);
                return (
                  <>
                    <div style={{ color: validation.length ? '#28a745' : '#dc3545' }}>
                      {validation.length ? '✓' : '✗'} At least 8 characters
                    </div>
                    <div style={{ color: validation.lowercase ? '#28a745' : '#dc3545' }}>
                      {validation.lowercase ? '✓' : '✗'} One lowercase letter (a-z)
                    </div>
                    <div style={{ color: validation.uppercase ? '#28a745' : '#dc3545' }}>
                      {validation.uppercase ? '✓' : '✗'} One uppercase letter (A-Z)
                    </div>
                    <div style={{ color: validation.number ? '#28a745' : '#dc3545' }}>
                      {validation.number ? '✓' : '✗'} One number (0-9)
                    </div>
                  </>
                );
              })()}
            </div>
          )}
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
