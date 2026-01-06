document.addEventListener('DOMContentLoaded', () => {
    const { DEFAULTS, clamp, normalizeSpeedConfig, toInt } = window.VideoGearSpeed;
    const speedValDisplay = document.getElementById('current-speed-val');
    const speedSlider = document.getElementById('speed-slider');
    const speedUpBtn = document.getElementById('speed-up');
    const speedDownBtn = document.getElementById('speed-down');
    const speedResetBtn = document.getElementById('speed-reset');
    const presetBtns = document.querySelectorAll('.preset-btn');
    const openSettingsBtn = document.getElementById('open-settings');
    const langToggleBtn = document.getElementById('lang-toggle');
    const noMediaMsg = document.getElementById('no-media-msg');
    let activeTabId = null;
    let mediaStatusReceived = false;
    let noMediaTimer = null;

    const DEFAULT_SPEED = 100;
    let config = { ...DEFAULTS };

    const i18n = {
        JP: {
            title: 'ビデオギア',
            noMedia: '対象メディアが見つかりません',
            settings: '設定',
            reset: 'リセット',
            langToggle: 'EN',
            langToggleTitle: '言語を切り替える',
            settingsTitle: '設定を開く'
        },
        EN: {
            title: 'Video Gear',
            noMedia: 'No media found',
            settings: 'Settings',
            reset: 'Reset',
            langToggle: 'JP',
            langToggleTitle: 'Switch language',
            settingsTitle: 'Open settings'
        }
    };

    // 初期化
    chrome.storage.sync.get(['speedStep', 'speedMin', 'speedMax', 'presets', 'lang'], (data) => {
        config = normalizeSpeedConfig(data);
        speedSlider.min = config.min;
        speedSlider.max = config.max;
        presetBtns.forEach((btn, index) => {
            const value = config.presets[index];
            btn.textContent = value + '%';
            btn.dataset.speed = value;
        });

        updateLang();
        setDisplay(DEFAULT_SPEED, { allowOutOfRangeDisplay: true });
    });

    let isDisplayOutOfRange = false;
    let lastDisplaySpeed = DEFAULT_SPEED;

    function setDisplay(speed, { allowOutOfRangeDisplay } = {}) {
        const numeric = toInt(speed, DEFAULT_SPEED);
        lastDisplaySpeed = numeric;
        if (allowOutOfRangeDisplay) {
            isDisplayOutOfRange = numeric < config.min || numeric > config.max;
            speedValDisplay.textContent = numeric;
            speedSlider.value = clamp(numeric, config.min, config.max);
            return numeric;
        }
        const normalized = clamp(numeric, config.min, config.max);
        isDisplayOutOfRange = false;
        speedValDisplay.textContent = normalized;
        speedSlider.value = normalized;
        return normalized;
    }

    function saveSpeed(speed) {
        const normalized = setDisplay(speed, { allowOutOfRangeDisplay: false });
        if (!activeTabId) return;
        chrome.runtime.sendMessage({ action: 'set-tab-speed', tabId: activeTabId, speed: normalized }, () => {
            if (chrome.runtime.lastError) return;
        });
    }

    function applySpeedToPage(speed) {
        const normalized = setDisplay(speed, { allowOutOfRangeDisplay: false });
        if (!activeTabId) return;
        chrome.tabs.sendMessage(activeTabId, { action: 'apply-speed', speed: normalized }, () => {
            if (chrome.runtime.lastError) return;
        });
    }

    function updateLang() {
        const dict = i18n[config.currentLang];
        langToggleBtn.textContent = dict.langToggle;
        noMediaMsg.textContent = i18n[config.currentLang].noMedia;
        speedResetBtn.textContent = i18n[config.currentLang].reset;
        langToggleBtn.setAttribute('title', dict.langToggleTitle);
        openSettingsBtn.setAttribute('title', dict.settingsTitle);
        document.title = dict.title;
        const titleEl = document.querySelector('[data-i18n="popupTitle"]');
        if (titleEl) titleEl.textContent = dict.title;
    }

    speedSlider.addEventListener('input', (e) => {
        if (isDisplayOutOfRange) {
            const snapped = lastDisplaySpeed > config.max ? config.max : config.min;
            applySpeedToPage(snapped);
            return;
        }
        const normalized = toInt(e.target.value, DEFAULT_SPEED);
        applySpeedToPage(normalized);
    });

    speedSlider.addEventListener('change', (e) => {
        if (isDisplayOutOfRange) return;
        saveSpeed(e.target.value);
    });

    speedUpBtn.addEventListener('click', () => {
        const val = clamp(toInt(speedSlider.value, DEFAULT_SPEED) + config.step, config.min, config.max);
        saveSpeed(val);
    });

    speedDownBtn.addEventListener('click', () => {
        const val = clamp(toInt(speedSlider.value, DEFAULT_SPEED) - config.step, config.min, config.max);
        saveSpeed(val);
    });

    speedResetBtn.addEventListener('click', () => {
        saveSpeed(DEFAULT_SPEED);
    });

    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            saveSpeed(btn.dataset.speed);
        });
    });

    langToggleBtn.addEventListener('click', () => {
        config.currentLang = config.currentLang === 'JP' ? 'EN' : 'JP';
        updateLang();
        chrome.storage.sync.set({ lang: config.currentLang });
    });

    openSettingsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (!message) return;
        if (message.action === 'tab-speed-updated') {
            if (activeTabId && message.tabId === activeTabId) {
                setDisplay(message.speed, { allowOutOfRangeDisplay: true });
            }
            return;
        }
        if (message.action === 'mediaStatus' && message.mediaStatus) {
            mediaStatusReceived = true;
            noMediaMsg.classList.add('hidden');
            if (noMediaTimer) {
                clearTimeout(noMediaTimer);
                noMediaTimer = null;
            }
        }
    });

    // メディアの存在確認（簡易）
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0]) return;
        activeTabId = tabs[0].id;
        noMediaMsg.classList.add('hidden');
        chrome.runtime.sendMessage({ action: 'get-tab-speed', tabId: activeTabId }, (response) => {
            if (chrome.runtime.lastError) return;
            if (response && response.success && typeof response.speed === 'number') {
                setDisplay(response.speed, { allowOutOfRangeDisplay: true });
            }
        });
        chrome.runtime.sendMessage({ action: 'get-media-status', tabId: activeTabId }, (response) => {
            if (chrome.runtime.lastError) {
                noMediaMsg.classList.remove('hidden');
                return;
            }
            if (response && response.success && response.mediaStatus) {
                mediaStatusReceived = true;
                noMediaMsg.classList.add('hidden');
                return;
            }
            noMediaTimer = setTimeout(() => {
                if (mediaStatusReceived) return;
                chrome.tabs.sendMessage(activeTabId, { action: 'get-media-count' }, (countResponse) => {
                    if (chrome.runtime.lastError) {
                        return;
                    }
                    if (countResponse && countResponse.count > 0) {
                        noMediaMsg.classList.add('hidden');
                        return;
                    }
                    if (countResponse && countResponse.count === 0) {
                        noMediaMsg.classList.remove('hidden');
                    }
                });
            }, 2000);
        });
    });
});
