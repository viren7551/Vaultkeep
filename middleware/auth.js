const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  let authHeader = req.header('Authorization');
  
  // Support reading token from query parameters (for browser-native downloads)
  if (!authHeader && req.query.token) {
    authHeader = `Bearer ${req.query.token}`;
  }

  if (!authHeader) {
    return res.status(401).json({ error: 'No token, authorization denied' });
  }

  // Expect header in format: Bearer <token>
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Token format is invalid' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'vaultkeep_jwt_secret_token_key_99');
    req.user = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is not valid' });
  }
};
