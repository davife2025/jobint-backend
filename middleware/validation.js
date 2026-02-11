const Joi = require('joi');

// Validation schemas
const schemas = {
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    firstName: Joi.string().min(1).max(100),
    lastName: Joi.string().min(1).max(100),
    location: Joi.string().max(255)
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  updateProfile: Joi.object({
    firstName: Joi.string().min(1).max(100),
    lastName: Joi.string().min(1).max(100),
    phone: Joi.string().max(20),
    location: Joi.string().max(255),
    preferences: Joi.object()
  }),

  addSkill: Joi.object({
    skillName: Joi.string().required(),
    yearsExperience: Joi.number().min(0).max(50),
    proficiency: Joi.string().valid('beginner', 'intermediate', 'advanced', 'expert')
  })
};

// Middleware generator
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors 
      });
    }
    
    next();
  };
};

module.exports = {
  validateRegister: validate(schemas.register),
  validateLogin: validate(schemas.login),
  validateUpdateProfile: validate(schemas.updateProfile),
  validateAddSkill: validate(schemas.addSkill)
};