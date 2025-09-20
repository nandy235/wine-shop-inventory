/**
 * Security Middleware
 * Comprehensive security headers and validation
 */

const rateLimit = require('express-rate-limit');

/**
 * Security Headers Middleware
 */
const securityHeaders = (req, res, next) => {
  // Prevent XSS attacks
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self'; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none';"
  );
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  next();
};

/**
 * Rate Limiting for Authentication
 */
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests
  skipSuccessfulRequests: true
});

/**
 * General API Rate Limiting
 */
const apiRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per minute
  message: {
    error: 'Too many requests, please slow down.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Input Sanitization Utilities
 */
const sanitizeString = (input, maxLength = 1000) => {
  if (typeof input !== 'string') {
    return input;
  }
  
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim()
    .substring(0, maxLength);
};

const sanitizeNumber = (input, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const num = parseFloat(input);
  if (isNaN(num)) {
    return 0;
  }
  return Math.max(min, Math.min(max, num));
};

const sanitizeRetailerCode = (code) => {
  if (!code) return '';
  return code.toString().replace(/\D/g, '').substring(0, 7);
};

/**
 * Input Validation Middleware
 */
const validateInput = (validationRules) => {
  return (req, res, next) => {
    const errors = [];
    
    for (const [field, rules] of Object.entries(validationRules)) {
      const value = req.body[field];
      
      // Required field check
      if (rules.required && (!value || value.toString().trim() === '')) {
        errors.push(`${field} is required`);
        continue;
      }
      
      // Skip further validation if field is not required and empty
      if (!rules.required && (!value || value.toString().trim() === '')) {
        continue;
      }
      
      // Type validation
      if (rules.type === 'string' && typeof value !== 'string') {
        errors.push(`${field} must be a string`);
      }
      
      if (rules.type === 'number' && isNaN(parseFloat(value))) {
        errors.push(`${field} must be a number`);
      }
      
      if (rules.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors.push(`${field} must be a valid email`);
      }
      
      if (rules.type === 'retailerCode' && !/^\d{7}$/.test(value)) {
        errors.push(`${field} must be exactly 7 digits`);
      }
      
      // Length validation
      if (rules.minLength && value.toString().length < rules.minLength) {
        errors.push(`${field} must be at least ${rules.minLength} characters`);
      }
      
      if (rules.maxLength && value.toString().length > rules.maxLength) {
        errors.push(`${field} must be no more than ${rules.maxLength} characters`);
      }
      
      // Custom pattern validation
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push(`${field} format is invalid`);
      }
      
      // Sanitize the input
      if (rules.type === 'string') {
        req.body[field] = sanitizeString(value, rules.maxLength);
      } else if (rules.type === 'number') {
        req.body[field] = sanitizeNumber(value, rules.min, rules.max);
      } else if (rules.type === 'retailerCode') {
        req.body[field] = sanitizeRetailerCode(value);
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors
      });
    }
    
    next();
  };
};

/**
 * CSRF Protection (Simple token-based)
 */
const csrfProtection = (req, res, next) => {
  // Skip CSRF for GET requests and auth endpoints
  if (req.method === 'GET' || req.path === '/api/login' || req.path === '/api/register') {
    return next();
  }
  
  const token = req.headers['x-csrf-token'] || req.body._csrf;
  const sessionToken = req.headers['authorization'];
  
  if (!token || !sessionToken) {
    return res.status(403).json({ message: 'CSRF token required' });
  }
  
  // Simple CSRF validation - in production, use a more robust method
  const expectedToken = Buffer.from(sessionToken).toString('base64').substring(0, 32);
  
  if (token !== expectedToken) {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }
  
  next();
};

/**
 * Generate CSRF token for client
 */
const generateCSRFToken = (authToken) => {
  if (!authToken) return null;
  return Buffer.from(authToken).toString('base64').substring(0, 32);
};

module.exports = {
  securityHeaders,
  authRateLimit,
  apiRateLimit,
  validateInput,
  csrfProtection,
  generateCSRFToken,
  sanitizeString,
  sanitizeNumber,
  sanitizeRetailerCode
};
