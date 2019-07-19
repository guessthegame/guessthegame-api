import { push } from 'connected-react-router';
import Noty from 'noty';
import screenshotService from '../services/screenshotService';
import store from '../store';

export default {
  goToScreenshot,
  loadScreenshot,
  getUnsolvedScreenshot,
  tryProposal,
  resetGuess,
  removeOwnScreenshot,
};

function goToScreenshot(screenshot) {
  return dispatch => {
    dispatch(push(`/screenshot/${screenshot.id}`));
  };
}

function loadScreenshot(screenshotId, navigate = false) {
  return async dispatch => {
    dispatch({ type: 'SCREENSHOT_LOADING' });
    const screenshot = await screenshotService.getFromId(screenshotId);
    dispatch({ type: 'SCREENSHOT_LOAD', payload: screenshot });
    if (navigate) {
      dispatch(push(`/screenshot/${screenshot.id}`));
    }
    const prevAndNext = await screenshotService.getPrevAndNext({
      screenshotId,
    });
    dispatch({ type: 'SCREENSHOT_LOAD_PREV_AND_NEXT', payload: prevAndNext });
  };
}

function getUnsolvedScreenshot(exclude) {
  return async dispatch => {
    dispatch({ type: 'SCREENSHOT_LOADING' });
    const res = await screenshotService.getUnsolved(exclude);
    if (res.error && res.code === 'UNSOLVED_SCREENSHOT_NOT_FOUND') {
      dispatch(push('/la-fin'));
    } else {
      dispatch(push(`/screenshot/${res.id}`));
      dispatch({ type: 'SCREENSHOT_LOAD', payload: res });
      const prevAndNext = await screenshotService.getPrevAndNext({
        screenshotId: res.id,
      });
      dispatch({ type: 'SCREENSHOT_LOAD_PREV_AND_NEXT', payload: prevAndNext });
    }
  };
}

function tryProposal(screenshot, proposition) {
  return async dispatch => {
    dispatch({ type: 'SCREENSHOT_PROPOSAL_TRY' });
    const res = await screenshotService.guess(screenshot.id, proposition);
    if (res.jwt) {
      dispatch({ type: 'USER_LOG_IN', payload: { jwt: res.jwt } });
    }
    if (!res.correct) {
      dispatch({ type: 'SCREENSHOT_PROPOSAL_FAILURE' });
      return;
    }
    dispatch({ type: 'SCREENSHOT_PROPOSAL_SUCCESS', payload: res });
    if (!res.newRankingData) {
      return;
    }
    const { currentRanking, newRanking } = res.newRankingData;
    const isFirstOneToSolve = !screenshot.stats.firstSolvedBy;
    const hasNewRanking = newRanking < currentRanking;

    // If the user is the first one to solve the screenshot
    if (isFirstOneToSolve) {
      notify({
        text: '️Bravo, vous êtes le premier a avoir trouvé ce screenshot ! 💪',
      });
    }

    // If the user got a new ranking
    if (hasNewRanking) {
      if (newRanking === 1) {
        notify({
          text: `C'est ouf !!! Vous passez à la première place ! 👑`,
        });
      } else {
        notify({
          text: `Bravo ! Vous passez à la ${newRanking}ème place ! 🏆`,
        });
      }
    }

    // If the user is registered, we stop here
    if (store.getState().user.username) {
      return;
    }
    // If the user has no achievements, we stop here
    if (!isFirstOneToSolve && !hasNewRanking) {
      return;
    }
    // If the user is not registered but has achieved something, we kindly suggest him to register
    let text;
    if (hasNewRanking && !isFirstOneToSolve) {
      text =
        '️Inscrivez vous pour enregistrer votre place dans le classement !';
    } else if (!hasNewRanking && isFirstOneToSolve) {
      text =
        'Inscrivez vous pourt vous la péter en montrant qui est le premier qui a trouvé !';
    } else {
      text =
        '️Inscrivez vous pour enregistrer votre place dans le classement et montrer au monde qui est le premier qui a trouvé !';
    }
    notify({
      text,
      type: 'info',
      timeout: 20000,
      onClick: () => {
        dispatch(push('/inscription'));
      },
    });
  };
}

function resetGuess() {
  return { type: 'SCREENSHOT_PROPOSAL_RESET' };
}

function removeOwnScreenshot(screenshotId) {
  return dispatch => {
    screenshotService.removeOwn(screenshotId).then(res => {
      if (!res.error) {
        dispatch(push('/'));
      }
    });
  };
}

function notify(options) {
  new Noty({
    text: options.text,
    type: options.type || 'success',
    timeout: options.timeout || 10000,
    callbacks: {
      onClick: options.onClick,
    },
  }).show();
}
