// Talks to start.ng through its hidden connect page.
const START_NG = 'https://start.ng';

export const ON_START_NG = location.protocol === 'https:' && location.hostname.endsWith('.start.ng');
export const CHOSE_GUEST = new URLSearchParams(location.search).has('guest');

let frame;

function connectFrame() {
  frame ??= new Promise((resolve, reject) => {
    const el = document.createElement('iframe');
    el.src = `${START_NG}/connect`;
    el.hidden = true;
    el.onload = () => resolve(el);
    el.onerror = reject;
    document.body.append(el);
  });
  return frame;
}

// Sends a message and resolves to start.ng's reply, or null if it didn't answer.
export function askStartNg(message, replyType, timeoutMs = 5000) {
  if (!ON_START_NG) return Promise.resolve(null);
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    let el = null;
    const done = (reply) => {
      clearTimeout(timer);
      removeEventListener('message', onMessage);
      resolve(reply);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    function onMessage(e) {
      if (e.origin !== START_NG || !el || e.source !== el.contentWindow) return;
      if (e.data?.type === replyType && e.data.requestId === requestId) done(e.data);
    }
    addEventListener('message', onMessage);
    connectFrame().then(
      (frameEl) => {
        el = frameEl;
        el.contentWindow.postMessage({ ...message, requestId }, START_NG);
      },
      () => done(null),
    );
  });
}

export function signInUrl() {
  return `${START_NG}/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;
}

// The connect page doesn't need the session start.ng appends after sign-in, so keep it out of the address bar.
export function tidyAddress() {
  if (location.hash.includes('startng_session')) {
    history.replaceState(null, '', location.pathname + location.search);
  }
}
