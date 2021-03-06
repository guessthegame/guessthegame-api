const bluebird = require('bluebird');
const path = require('path');
const fs = require('fs');
const screenshotManager = require('../managers/screenshotManager');
const viewedScreenshotManager = require('../managers/viewedScreenshotManager');
const solvedScreenshotManager = require('../managers/solvedScreenshotManager');
const userManager = require('../managers/userManager');
const tokenService = require('../services/tokenService');
const recaptchaService = require('../services/recaptchaService');
const moderationService = require('../services/moderationService');
const logger = require('../logger');

module.exports = {
  getfromId,
  getUnsolvedScreenshot,
  getLastAddedScreenshot,
  getPrevAndNext,
  removeOwnScreenshot,
  tryProposal,
  uploadScreenshot,
  addScreenshot,
  editScreenshot,
  rateScreenshot,
};

async function getfromId(req) {
  const userId = req.user.id;
  const screenshotId = req.body.id;
  const [res, ownRating] = await Promise.all([
    await screenshotManager.getFromId(screenshotId, userId),
    await userManager.getScreenshotRating({ screenshotId, userId }),
    userId &&
      (await viewedScreenshotManager.markScreenshotAsViewed({
        screenshotId,
        userId,
      })),
  ]);

  if (!res) {
    return bluebird.reject({
      status: 404,
      code: 'SCREENSHOT_NOT_FOUND',
      message: 'Screenshot inconnu.',
    });
  }

  const screenshot = {
    isSolved: false,
    isOwn: req.user.id === res.user.id,
    id: res.id,
    imageUrl: res.imageUrl,
    createdAt: res.createdAt,
    approvalStatus: res.approvalStatus,
    rating: res.rating,
    addedBy: res.user.username,
    stats: res.stats,
    ownRating,
  };
  if (res.solvedScreenshots && res.solvedScreenshots.length) {
    screenshot.isSolved = true;
    screenshot.solvedAt = res.solvedScreenshots[0].createdAt;
  }
  if (screenshot.isSolved || res.user.id === req.user.id) {
    screenshot.name = res.name;
    screenshot.year = res.year;
  }
  return screenshot;
}

async function getUnsolvedScreenshot(req) {
  const userId = req.user.id;
  let needToResetExclusion = false;
  // Exclude needs to be an array (retro compat)
  const exclude =
    req.body.exclude && !req.body.exclude.join
      ? [req.body.exclude]
      : req.body.exclude;

  // First, we try to get a screenshot the user has never seen before
  let isUnseenScreenshot = true;
  let screenshot = await screenshotManager.getUnsolved({
    userId,
    exclude,
    unseenOnly: true,
  });

  // If no screenshot were found, we try again without the "unseen only" flag
  if (!screenshot) {
    isUnseenScreenshot = false;
    screenshot = await screenshotManager.getUnsolved({
      userId,
      exclude,
    });
  }

  // If still no screenshot were found
  if (!screenshot) {
    // If we did not exclude any screenshot, then there's no screenshot left
    if (!exclude) {
      return notFoundReject();
    }
    // If we did exclude screenshots from the search, we try again without the exclusion
    screenshot = await screenshotManager.getUnsolved({ userId });
    if (!screenshot) {
      return notFoundReject();
    }
    // If we found a screenshot after removing the exclusion, it means that the frontend needs to reset its exclusion's array
    needToResetExclusion = true;
  }
  return {
    ...(await getfromId({ ...req, body: { ...req.body, id: screenshot.id } })),
    needToResetExclusion,
    isUnseenScreenshot,
  };

  function notFoundReject() {
    return bluebird.reject({
      status: 404,
      code: 'UNSOLVED_SCREENSHOT_NOT_FOUND',
      message: 'No screenshot can be found for that user.',
    });
  }
}

async function getLastAddedScreenshot(req) {
  const screenshotId = await screenshotManager.getLastAdded();
  return getfromId({ ...req, body: { ...req.body, id: screenshotId } });
}

async function getPrevAndNext(req) {
  const { screenshotId } = req.body;
  return screenshotManager.getPrevAndNext({ screenshotId });
}

async function removeOwnScreenshot(req) {
  if (!req.user) {
    bluebird.reject({
      status: 401,
      code: 'MUST_BE_IDENTIFIED',
      message:
        'User must be identified in order to delete his own screenshots.',
    });
    return;
  }
  // We delete the screenshot
  await screenshotManager.deleteUserScreenshot({
    userId: req.user.id,
    screenshotId: req.body.screenshotId,
  });
}

async function tryProposal(req) {
  const { screenshotId, proposal } = req.body;
  const screenshot = await screenshotManager.testProposal(
    screenshotId,
    proposal
  );
  if (!screenshot) {
    return { correct: false };
  }

  let jwt;
  if (!req.user.id) {
    const user = await userManager.create({});
    jwt = tokenService.createUserToken(user);
    req.user = user;
  }

  const newRankingData = await userManager.getNewRanking(req.user.id);

  await solvedScreenshotManager.markScreenshotAsResolved({
    screenshotId,
    userId: req.user.id,
  });
  return {
    newRankingData,
    correct: true,
    screenshotName: screenshot.name,
    year: screenshot.year,
    jwt,
  };
}

function uploadScreenshot(req) {
  const imageFile = req.files.file;
  const imageName = imageFile.name;
  const extention = path.extname(imageName);
  const localImageName = `${Date.now()}${extention}`;
  const localImagePath = getUploadedImageLocalPath(localImageName);

  // We move the uploaded file to the uploads folder
  imageFile.mv(localImagePath);

  // The file will be deleted in 20min
  setTimeout(() => {
    logger.info(`Deleting ${localImagePath}`);
    fs.unlinkSync(localImagePath);
  }, 20 * 60 * 1000);

  const imagePath = `/api/uploads/${localImageName}`;

  return { imagePath, localImageName };
}

async function addScreenshot(req) {
  const { user } = req;
  if (!user) {
    return bluebird.reject({
      status: 401,
      code: 'MUST_BE_IDENTIFIED',
      message: 'User must be identified to add a new screenshot.',
    });
  }

  ['name', 'localImageName', 'recaptchaToken'].forEach(field => {
    if (!req.body[field]) {
      throw new Error(`User ${field} cannot be null`);
    }
  });

  // I'm not a robot (Google Recaptcha)
  const isTokenVerified = await recaptchaService.verifyToken(
    req.body.recaptchaToken
  );
  if (!isTokenVerified) {
    return bluebird.reject({
      code: 'RECAPTCHA_ERROR',
      message: 'Recaptcha challenge not successful.',
    });
  }

  // Uploading to cloudinary
  const localImagePath = getUploadedImageLocalPath(req.body.localImageName);

  // Inserting the image in the database
  const screenshot = await screenshotManager.create({
    localImagePath,
    gameCanonicalName: req.body.name,
    alternativeNames: req.body.alternativeNames,
    year: req.body.year || null,
    userId: user.id,
  });

  // Send email to moderators (asynchronosly = no await)
  moderationService.notifyModeratorsOfNewScreenshot(screenshot);

  return screenshot;
}

async function editScreenshot(req) {
  const { user } = req;
  if (!user) {
    return bluebird.reject({
      status: 401,
      code: 'MUST_BE_IDENTIFIED',
      message: 'User must be identified to edit a screenshot.',
    });
  }

  if (!req.body.name) {
    throw new Error(`Screenshot needs to have a name`);
  }

  const localImagePath = getUploadedImageLocalPath(req.body.localImageName);

  return screenshotManager.edit({
    id: req.body.id,
    user: req.user,
    localImagePath,
    data: {
      gameCanonicalName: req.body.name,
      alternativeNames: req.body.alternativeNames,
      year: req.body.year,
    },
  });
}

async function rateScreenshot(req) {
  const userId = req.user.id;
  const { screenshotId, rating } = req.body;
  let checkedRating = rating;
  if (rating > 10) {
    checkedRating = 10;
  } else if (rating < 0) {
    checkedRating = 0;
  }
  return screenshotManager.rate({
    screenshotId,
    userId,
    rating: checkedRating,
  });
}

function getUploadedImageLocalPath(imageName) {
  if (!imageName) {
    return null;
  }
  return `${__dirname}/../../uploads/${imageName}`;
}
