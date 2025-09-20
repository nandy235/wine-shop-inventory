/**
 * Validation Schemas using Joi
 * Server-side validation is critical - client-side is just UX
 */

const Joi = require('joi');

// Custom validation for retailer code
const retailerCodeSchema = Joi.string()
  .pattern(/^\d{7}$/)
  .required()
  .messages({
    'string.pattern.base': 'Retailer code must be exactly 7 digits',
    'any.required': 'Retailer code is required'
  });

// Login validation schema
const loginSchema = Joi.object({
  retailerCode: retailerCodeSchema,
  password: Joi.string()
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.min': 'Password is required',
      'string.max': 'Password is too long',
      'any.required': 'Password is required'
    })
});

// Registration validation schema
const registerSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .pattern(/^[a-zA-Z\s]+$/)
    .required()
    .messages({
      'string.min': 'Name must be at least 2 characters',
      'string.max': 'Name is too long',
      'string.pattern.base': 'Name can only contain letters and spaces',
      'any.required': 'Name is required'
    }),
  
  email: Joi.string()
    .email()
    .max(255)
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'string.max': 'Email is too long',
      'any.required': 'Email is required'
    }),
  
  password: Joi.string()
    .min(8)
    .max(100)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.max': 'Password is too long',
      'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, and one number',
      'any.required': 'Password is required'
    }),
  
  shopName: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Shop name must be at least 2 characters',
      'string.max': 'Shop name is too long',
      'any.required': 'Shop name is required'
    }),
  
  retailerCode: retailerCodeSchema,
  
  address: Joi.string()
    .max(500)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Address is too long'
    }),
  
  licenseNumber: Joi.string()
    .max(50)
    .optional()
    .allow('')
    .messages({
      'string.max': 'License number is too long'
    })
});

// Stock onboarding validation schema
const stockOnboardingSchema = Joi.object({
  products: Joi.array()
    .items(
      Joi.object({
        id: Joi.number().integer().positive().required(),
        quantity: Joi.number().integer().min(1).max(10000).required(),
        markup: Joi.number().min(0).max(1000).required()
      })
    )
    .min(1)
    .max(50) // Reduced from 100 to prevent large requests and potential DoS
    .required()
    .messages({
      'array.min': 'At least one product is required',
      'array.max': 'Too many products in single request (maximum 50)',
      'any.required': 'Products array is required'
    }),
  
  businessDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required()
    .messages({
      'string.pattern.base': 'Business date must be in YYYY-MM-DD format',
      'any.required': 'Business date is required'
    })
});

// Stock update validation schema
const stockUpdateSchema = Joi.object({
  quantity: Joi.number()
    .integer()
    .min(0)
    .max(10000)
    .required()
    .messages({
      'number.min': 'Quantity cannot be negative',
      'number.max': 'Quantity is too large',
      'any.required': 'Quantity is required'
    }),
  
  finalPrice: Joi.number()
    .min(0)
    .max(100000)
    .required()
    .messages({
      'number.min': 'Price cannot be negative',
      'number.max': 'Price is too large',
      'any.required': 'Final price is required'
    })
});

// Generic ID validation
const idSchema = Joi.number()
  .integer()
  .positive()
  .required()
  .messages({
    'number.positive': 'ID must be a positive number',
    'any.required': 'ID is required'
  });

/**
 * Validation middleware factory
 * Use a validation library like Joi or Yup
 * Only validate format/type on client - security validation on server
 */
const validateInput = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Return all validation errors
      stripUnknown: true, // Remove unknown fields
      convert: true // Convert strings to numbers where appropriate
    });
    
    if (error) {
      // Environment-based error handling for security
      const errors = process.env.NODE_ENV === 'development' 
        ? error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value // Include value in development only
          }))
        : [{ message: 'Invalid input provided' }]; // Generic message in production
      
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors,
        ...(process.env.NODE_ENV === 'development' && { 
          timestamp: new Date().toISOString(),
          path: req.path 
        })
      });
    }
    
    // Replace req.body with validated and sanitized data
    req.body = value;
    next();
  };
};

/**
 * Validate URL parameters
 */
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      convert: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        message: 'Invalid parameters',
        errors: errors
      });
    }
    
    req.params = value;
    next();
  };
};

/**
 * Validate query parameters
 */
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      convert: true,
      allowUnknown: true // Allow additional query params
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        message: 'Invalid query parameters',
        errors: errors
      });
    }
    
    req.query = { ...req.query, ...value };
    next();
  };
};

module.exports = {
  // Schemas
  loginSchema,
  registerSchema,
  stockOnboardingSchema,
  stockUpdateSchema,
  idSchema,
  
  // Middleware
  validateInput,
  validateParams,
  validateQuery
};
