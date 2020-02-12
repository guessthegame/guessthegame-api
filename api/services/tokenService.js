const jwt = require('jsonwebtoken');
const { secret } = require('../../config');

const logger = require('../logger');

module.exports = {
  createUserToken,
  createUserIdToken,
  decode,
  isOutdated,
  authenticateMiddleware,
};

function createUserToken(user) {
  return jwt.sign(
    {
      id: user.id,
      canModerateScreenshots: user.canModerateScreenshots,
    },
    secret
  );
}

function createUserIdToken(user) {
  return jwt.sign({ id: user.id }, secret);
}

function decode(token) {
  return jwt.verify(token, secret);
}

function isOutdated(decodedToken) {
  return Date.now() > (decodedToken.iat + 3600 * 48) * 1000;
}

function authenticateMiddleware(req, res, next) {
  if (req.body && req.body.jwt) {
    req.user = decode(req.body.jwt) || {};
  } else {
    req.user = {};
  }
  next();
}
