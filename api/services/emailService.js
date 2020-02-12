const bluebird = require('bluebird');
const mailgun = require('mailgun.js');
const config = require('../../config').mailgun;

const { host } = config;
const client = mailgun.client({
  url: config.url,
  key: config.key,
  username: 'api',
});

const newPasswordEmail = require('../emails/newPassword');
const moderationNewScreenshot = require('../emails/moderation/newScreenshot');
const marketingNewScreenshot = require('../emails/marketing/newScreenshots');

module.exports = {
  sendRequestNewPasswordEmail,
  sendModerationNewScreenshotEmail,
  sendMarketingUpdateEmail,
};

async function sendRequestNewPasswordEmail({ email, username, link }) {
  const data = newPasswordEmail({ username, link });
  return sendEmail({ to: email, ...data });
}

async function sendModerationNewScreenshotEmail({ email, emailData }) {
  const data = moderationNewScreenshot(emailData);
  return sendEmail({ to: email, ...data });
}

async function sendMarketingUpdateEmail({ email, emailData }) {
  const data = marketingNewScreenshot(emailData);
  return sendEmail({ to: email, ...data });
}

async function sendEmail({ to, subject, text, html }) {
  return client.messages
    .create(host, {
      from: 'Guess The Game <no-reply@mg.guess-the-game.com>',
      to,
      subject,
      text,
      html,
    })
    .catch(() =>
      bluebird.reject({
        code: 'EMAIL_ERROR',
        message: 'Cannot send the email',
      })
    );
}
