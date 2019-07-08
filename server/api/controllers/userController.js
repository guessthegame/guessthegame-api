const _ = require('lodash');
const bluebird = require('bluebird');
const userManager = require('../managers/userManager');
const tokenService = require('../services/tokenService');

module.exports = {
  getUser,
  updateUser,
  unsubscribeFromEmailUpdates,
};

async function getUser(req) {
  const { username } = req.user;
  const user = await userManager.get(username);
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    nbSolvedScreenshots: user.solvedScreenshots,
    nbAddedScreenshots: user.addedScreenshots,
    emailUpdates: user.emailUpdates,
  };
}

async function updateUser(req) {
  const { id } = req.user;
  const values = {};

  if (req.body.values.emailUpdates) {
    const emailUpdatesValues = ['never', 'weekly', 'daily', 'asap'];
    if (emailUpdatesValues.indexOf(req.body.values.emailUpdates) === -1) {
      throw new Error(
        `emailUpdates must be one of ${emailUpdatesValues.join(', ')}`
      );
    } else {
      values.emailUpdates = req.body.values.emailUpdates;
    }
  }

  if (_.isEmpty(values)) {
    throw new Error('nothing to update');
  }

  await userManager.update(id, values);
  return {
    ok: true,
  };
}

async function unsubscribeFromEmailUpdates(req) {
  const { emailToken } = req.body;
  if (!emailToken) {
    throw new Error('emailToken is missing');
  }
  const decodedToken = tokenService.decode(emailToken);
  if (tokenService.isOutdated(decodedToken)) {
    return bluebird.reject({
      code: 'OUTDATED_TOKEN',
      message: 'Your token has expired.',
    });
  }
  await userManager.update(decodedToken.id, { emailUpdates: 'never' });
  return {
    ok: true,
  };
}
