/**
 * Input Validation Helpers
 * Common validation functions for user inputs
 */

/**
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean} True if email is valid, false otherwise
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // RFC 5322 compliant email regex (simplified)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.toLowerCase());
};

/**
 * Validate phone number format
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if phone is valid, false otherwise
 */
const isValidPhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return false;
  }

  // Accepts formats: +1234567890, 123-456-7890, (123) 456-7890, etc.
  const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/;
  return phoneRegex.test(phone);
};

/**
 * Validate name format
 * @param {string} name - Name to validate
 * @returns {boolean} True if name is valid, false otherwise
 */
const isValidName = (name) => {
  if (!name || typeof name !== 'string') {
    return false;
  }

  // Name should be 1-100 characters, letters, spaces, hyphens, apostrophes
  const nameRegex = /^[a-zA-Z\s\-']{1,100}$/;
  return nameRegex.test(name.trim());
};

/**
 * Sanitize string input (remove potentially harmful characters)
 * @param {string} input - String to sanitize
 * @returns {string} Sanitized string
 */
const sanitizeString = (input) => {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Remove HTML tags and trim whitespace
  return input.replace(/<[^>]*>/g, '').trim();
};

/**
 * Validate required fields
 * @param {Object} data - Data object to validate
 * @param {Array<string>} requiredFields - Array of required field names
 * @returns {Object} Validation result with isValid and missing fields
 */
const validateRequiredFields = (data, requiredFields) => {
  const missing = [];

  for (const field of requiredFields) {
    if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
      missing.push(field);
    }
  }

  return {
    isValid: missing.length === 0,
    missing
  };
};

/**
 * Validate user registration data
 * @param {Object} data - Registration data
 * @returns {Object} Validation result with isValid and errors
 */
const validateRegistrationData = (data) => {
  const errors = [];

  // Check required fields
  const requiredFields = ['email', 'password', 'first_name', 'last_name', 'company_id'];
  const requiredCheck = validateRequiredFields(data, requiredFields);

  if (!requiredCheck.isValid) {
    errors.push(`Missing required fields: ${requiredCheck.missing.join(', ')}`);
  }

  // Validate email
  if (data.email && !isValidEmail(data.email)) {
    errors.push('Invalid email format');
  }

  // Validate names
  if (data.first_name && !isValidName(data.first_name)) {
    errors.push('Invalid first name format');
  }

  if (data.last_name && !isValidName(data.last_name)) {
    errors.push('Invalid last name format');
  }

  // Validate phone number if provided
  if (data.phone_number && !isValidPhoneNumber(data.phone_number)) {
    errors.push('Invalid phone number format');
  }

  // Validate company_id
  if (data.company_id && (!Number.isInteger(Number(data.company_id)) || Number(data.company_id) <= 0)) {
    errors.push('Invalid company ID');
  }

  // Validate user_type_id if provided
  if (data.user_type_id && (!Number.isInteger(Number(data.user_type_id)) || Number(data.user_type_id) <= 0)) {
    errors.push('Invalid user type ID');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate login data
 * @param {Object} data - Login data
 * @returns {Object} Validation result with isValid and errors
 */
const validateLoginData = (data) => {
  const errors = [];

  // Check required fields
  const requiredFields = ['email', 'password'];
  const requiredCheck = validateRequiredFields(data, requiredFields);

  if (!requiredCheck.isValid) {
    errors.push(`Missing required fields: ${requiredCheck.missing.join(', ')}`);
  }

  // Validate email
  if (data.email && !isValidEmail(data.email)) {
    errors.push('Invalid email format');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate password reset data
 * @param {Object} data - Password reset data
 * @returns {Object} Validation result with isValid and errors
 */
const validatePasswordResetData = (data) => {
  const errors = [];

  // Check required fields
  const requiredFields = ['token', 'new_password'];
  const requiredCheck = validateRequiredFields(data, requiredFields);

  if (!requiredCheck.isValid) {
    errors.push(`Missing required fields: ${requiredCheck.missing.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

module.exports = {
  isValidEmail,
  isValidPhoneNumber,
  isValidName,
  sanitizeString,
  validateRequiredFields,
  validateRegistrationData,
  validateLoginData,
  validatePasswordResetData
};
