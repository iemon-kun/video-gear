const STORAGE_DEFAULTS = {
  toggleSpeed: 200,
  speedStep: 10,
  speedMin: 50,
  speedMax: 250,
  presets: [50, 100, 125, 150, 175, 200],
  toggleKeyCode: 'F13',
  toggleShortcuts: []
};
const SESSION_KEY = 'tabSpeeds';
const DEFAULT_SPEED = 100;

importScripts('utils/speed.js');
const { clamp, toInt } = globalThis.VideoGearSpeed;
const clampSpeed = (value, fallback) => {
  const parsed = toInt(value, fallback);
  return clamp(parsed, 1, 2000);
};

const getSettings = async () => {
  const data = await chrome.storage.sync.get([
    'toggleSpeed'
  ]);

  return {
    toggleSpeed: clampSpeed(data.toggleSpeed, STORAGE_DEFAULTS.toggleSpeed)
  };
};

const resolveToggleSpeed = async (requestedSpeed) => {
  if (typeof requestedSpeed !== 'undefined') {
    return clampSpeed(requestedSpeed, STORAGE_DEFAULTS.toggleSpeed);
  }
  const { toggleSpeed } = await getSettings();
  return toggleSpeed;
};

const mediaStatuses = {};

const getTabSpeeds = async () => {
  const data = await chrome.storage.session.get([SESSION_KEY]);
  return data[SESSION_KEY] || {};
};

const setTabSpeeds = async (next) => {
  await chrome.storage.session.set({ [SESSION_KEY]: next });
};

const setTabSpeed = async (tabId, speed) => {
  const map = await getTabSpeeds();
  map[String(tabId)] = speed;
  await setTabSpeeds(map);
  chrome.tabs.sendMessage(tabId, { action: 'apply-speed', speed }, () => {
    if (chrome.runtime.lastError) return;
  });
  chrome.runtime.sendMessage({ action: 'tab-speed-updated', tabId, speed }, () => {
    if (chrome.runtime.lastError) return;
  });
};

const getTabSpeed = async (tabId) => {
  const map = await getTabSpeeds();
  const stored = map[String(tabId)];
  return clampSpeed(stored, DEFAULT_SPEED);
};

const toggleSpeedForTab = async (tabId, requestedSpeed) => {
  if (!tabId) return;
  const targetSpeed = await resolveToggleSpeed(requestedSpeed);
  const currentSpeed = await getTabSpeed(tabId);
  const nextSpeed = currentSpeed === DEFAULT_SPEED ? targetSpeed : DEFAULT_SPEED;
  await setTabSpeed(tabId, clampSpeed(nextSpeed, DEFAULT_SPEED));
};

const toggleSpeed = async () => {
  const tab = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab[0]) return;
  await toggleSpeedForTab(tab[0].id);
};

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-speed') {
    toggleSpeed();
  }
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (!request || typeof request !== 'object') return false;
  if (request.action === 'toggle-speed') {
    const tabId = _sender?.tab?.id;
    if (tabId) {
      toggleSpeedForTab(tabId, request.speed).then(() => sendResponse({ success: true }));
      return true;
    }
    toggleSpeed().then(() => sendResponse({ success: true }));
    return true;
  }
  if (request.action === 'get-tab-speed') {
    const tabId = request.tabId || _sender?.tab?.id;
    if (!tabId) {
      sendResponse({ success: false });
      return true;
    }
    getTabSpeed(tabId).then((speed) => {
      sendResponse({ success: true, speed });
    });
    return true;
  }
  if (request.action === 'set-tab-speed') {
    const tabId = request.tabId || _sender?.tab?.id;
    if (!tabId) {
      sendResponse({ success: false });
      return true;
    }
    const nextSpeed = clampSpeed(request.speed, DEFAULT_SPEED);
    setTabSpeed(tabId, nextSpeed).then(() => {
      sendResponse({ success: true, speed: nextSpeed });
    });
    return true;
  }
  if (request.action === 'mediaStatus') {
    const tabId = _sender?.tab?.id || request.mediaStatus?.tabId;
    if (!tabId) {
      sendResponse({ success: false });
      return true;
    }
    mediaStatuses[String(tabId)] = request.mediaStatus;
    sendResponse({ success: true });
    return true;
  }
  if (request.action === 'get-media-status') {
    const tabId = request.tabId || _sender?.tab?.id;
    if (!tabId) {
      sendResponse({ success: false });
      return true;
    }
    sendResponse({ success: true, mediaStatus: mediaStatuses[String(tabId)] || null });
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(null, (data) => {
    if (data && Object.keys(data).length > 0) return;
    chrome.storage.sync.set({ ...STORAGE_DEFAULTS });
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  getTabSpeeds()
    .then((map) => {
      if (!map[String(tabId)]) return;
      delete map[String(tabId)];
      return setTabSpeeds(map);
    })
    .catch(() => {});
  delete mediaStatuses[String(tabId)];
});
