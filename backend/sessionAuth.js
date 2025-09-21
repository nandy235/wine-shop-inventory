/**
 * Session-based Authentication
 * Clean implementation using httpOnly cookies and sessions
 */

const session = require('express-session');
const csrf = require('csrf');

// Initialize CSRF protection
const csrfProtection = new csrf();

/**
 * Session configuration - Production ready
 */
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'your-session-secret-key-change-in-production',
  name: 'sessionId', // Don't use default session name
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true, // Prevent XSS
    secure: process.env.NODE_ENV === 'production', // Only secure in production (HTTPS)
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Strict for localhost, none for cross-domain
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  },
  rolling: true, // Reset expiration on activity
  
  // Additional security options
  genid: () => {
    // Generate cryptographically secure session IDs
    return require('crypto').randomBytes(32).toString('hex');
  }
};

/**
 * Authentication middleware - check if user is logged in
 */
const requireAuth = (req, res, next) => {
  console.log('🔍 Auth check - Session exists:', !!req.session);
  console.log('🔍 Session ID:', req.sessionID);
  console.log('🔍 Session data:', req.session);
  console.log('🔍 Session user:', req.session?.user);
  
  if (!req.session || !req.session.user) {
    console.log('❌ Auth failed - no session or user');
    return res.status(401).json({ 
      message: 'Authentication required',
      error: 'Not authenticated' 
    });
  }
  
  console.log('✅ Auth successful for user:', req.session.user.name);
  
  // Add user info to request for convenience
  req.user = req.session.user;
  next();
};

/**
 * CSRF middleware
 */
const csrfMiddleware = (req, res, next) => {
  // Skip CSRF for GET requests and auth endpoints
  if (req.method === 'GET' || req.path === '/api/login' || req.path === '/api/register' || req.path === '/api/auth/logout') {
    return next();
  }
  
  const token = req.headers['x-csrf-token'];
  const secret = req.session.csrfSecret;
  
  if (!token || !secret) {
    return res.status(403).json({ 
      message: 'CSRF token required',
      error: 'Missing CSRF token' 
    });
  }
  
  if (!csrfProtection.verify(secret, token)) {
    return res.status(403).json({ 
      message: 'Invalid CSRF token',
      error: 'CSRF validation failed' 
    });
  }
  
  next();
};

/**
 * Generate CSRF token for session
 */
const generateCSRFToken = (req) => {
  if (!req.session.csrfSecret) {
    req.session.csrfSecret = csrfProtection.secretSync();
  }
  return csrfProtection.create(req.session.csrfSecret);
};

/**
 * Login user - create session
 */
const loginUser = (req, user) => {
  req.session.user = {
    id: user.id,
    userId: user.id, // For compatibility with existing code
    shopId: user.shop_id,
    email: user.email,
    shopName: user.shop_name,
    retailerCode: user.retailer_code,
    name: user.name
  };
  
  // Generate CSRF secret for this session
  req.session.csrfSecret = csrfProtection.secretSync();
};

/**
 * Logout user - destroy session
 */
const logoutUser = (req, callback) => {
  req.session.destroy(callback);
};

/**
 * Refresh session - extend expiration
 */
const refreshSession = (req) => {
  if (req.session && req.session.user) {
    req.session.touch(); // Update session expiration
    return true;
  }
  return false;
};

module.exports = {
  sessionConfig,
  requireAuth,
  csrfMiddleware,
  generateCSRFToken,
  loginUser,
  logoutUser,
  refreshSession
};
