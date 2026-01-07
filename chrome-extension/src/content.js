(function () {
    let currentSpeed = 1.0;
    const defaultSpeed = 1.0;
    let toggleKeyCode = 'F13';
    let toggleSpeed = 200;
    let storedShortcuts = [];
    let toggleShortcuts = [];
    const MIN_RATE = 0.01;
    const MAX_RATE = 20;
    const RATE_EPSILON = 0.001;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const toRate = (value, fallback) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return clamp(parsed, MIN_RATE, MAX_RATE);
    };
    const trackedMedia = new WeakSet();
    const trackedRoots = new WeakSet();
    const trackedKeyRoots = new WeakSet();
    const trackedShadowRoots = new Set();
    const MEDIA_STATUS_THROTTLE_MS = 500;
    let rescanTimer = null;
    let lastMediaStatusKey = '';
    let lastMediaStatusAt = 0;
    let blockKeyUp = false;

    // 初期設定の読み込み
    const isExtensionContextValid = () => {
        try {
            return !!(chrome && chrome.runtime && chrome.runtime.id);
        } catch (_) {
            return false;
        }
    };

    const safeRuntimeSendMessage = (payload, callback) => {
        try {
            if (!isExtensionContextValid()) return false;
            chrome.runtime.sendMessage(payload, (response) => {
                if (chrome.runtime.lastError) return;
                if (typeof callback === 'function') callback(response);
            });
            return true;
        } catch (_) {
            return false;
        }
    };

    const clampSpeedValue = (value, fallback) => {
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) return fallback;
        return clamp(parsed, 1, 2000);
    };

    const buildShortcutList = (list, fallbackKey, fallbackSpeed) => {
        const shortcuts = [];
        if (fallbackKey) {
            shortcuts.push({ keyCode: fallbackKey, speed: fallbackSpeed });
        }
        if (Array.isArray(list)) {
            list.forEach((item) => {
                if (!item || typeof item.keyCode !== 'string') return;
                const speed = clampSpeedValue(item.speed, fallbackSpeed);
                shortcuts.push({ keyCode: item.keyCode, speed });
            });
        }
        return shortcuts;
    };

    chrome.storage.sync.get(['toggleKeyCode', 'toggleSpeed', 'toggleShortcuts'], (settings) => {
        currentSpeed = defaultSpeed;
        if (settings.toggleKeyCode) toggleKeyCode = settings.toggleKeyCode;
        if (typeof settings.toggleSpeed !== 'undefined') {
            toggleSpeed = clampSpeedValue(settings.toggleSpeed, toggleSpeed);
        }
        storedShortcuts = Array.isArray(settings.toggleShortcuts) ? settings.toggleShortcuts : [];
        toggleShortcuts = buildShortcutList(storedShortcuts, toggleKeyCode, toggleSpeed);
        safeRuntimeSendMessage({ action: 'get-tab-speed' }, (response) => {
            if (response && response.success && typeof response.speed === 'number') {
                currentSpeed = toRate(response.speed / 100, defaultSpeed);
            }
            applySpeedToAll(currentSpeed);
        });
    });

    // ストレージの変更を監視
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync') {
            let shouldRebuild = false;
            if (changes.toggleKeyCode) {
                toggleKeyCode = changes.toggleKeyCode.newValue;
                shouldRebuild = true;
            }
            if (changes.toggleSpeed) {
                toggleSpeed = clampSpeedValue(changes.toggleSpeed.newValue, toggleSpeed);
                shouldRebuild = true;
            }
            if (changes.toggleShortcuts) {
                storedShortcuts = Array.isArray(changes.toggleShortcuts.newValue) ? changes.toggleShortcuts.newValue : [];
                shouldRebuild = true;
            }
            if (shouldRebuild) {
                toggleShortcuts = buildShortcutList(storedShortcuts, toggleKeyCode, toggleSpeed);
            }
        }
    });

    function setPlaybackRateSafe(media, rate) {
        const normalized = toRate(rate, currentSpeed);
        const target = clamp(normalized, MIN_RATE, MAX_RATE);

        try {
            media.preservesPitch = true;
            media.mozPreservesPitch = true;
            media.webkitPreservesPitch = true;
        } catch (_) {}

        try {
            if (Math.abs(media.playbackRate - target) > RATE_EPSILON) {
                media.playbackRate = target;
            }
        } catch (_) {}

        try {
            if (Math.abs(media.defaultPlaybackRate - target) > RATE_EPSILON) {
                media.defaultPlaybackRate = target;
            }
        } catch (_) {}
    }

    function applySpeedToAll(speed) {
        const normalized = toRate(speed, currentSpeed);
        const targets = getAllMediaElements();
        targets.forEach(el => {
            setPlaybackRateSafe(el, normalized);
        });
    }

    function handleMediaEvent(event) {
        const media = event.target;
        if (!(media instanceof HTMLMediaElement)) return;
        if (event.type === 'ratechange' && typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
        }
        if (Math.abs(media.playbackRate - currentSpeed) <= RATE_EPSILON) return;
        setPlaybackRateSafe(media, currentSpeed);
        sendMediaStatus(media);
    }

    function getMediaStatus(media) {
        const title = document.title || '';
        const domain = location.hostname || '';
        return {
            tabId: 0,
            hasVideo: media instanceof HTMLVideoElement,
            domain,
            duration: Number.isFinite(media.duration) ? media.duration : 0,
            title,
            playing: !media.paused
        };
    }

    function sendMediaStatus(media) {
        if (!isExtensionContextValid()) return;
        const status = getMediaStatus(media);
        const key = [
            status.playing ? '1' : '0',
            status.hasVideo ? '1' : '0',
            status.duration.toFixed(2),
            status.domain,
            status.title
        ].join('|');
        const now = Date.now();
        if (key === lastMediaStatusKey && now - lastMediaStatusAt < MEDIA_STATUS_THROTTLE_MS) return;
        lastMediaStatusKey = key;
        lastMediaStatusAt = now;
        safeRuntimeSendMessage({ action: 'mediaStatus', mediaStatus: status });
    }

    function trackMedia(media) {
        if (!media || trackedMedia.has(media)) return;
        trackedMedia.add(media);
        setPlaybackRateSafe(media, currentSpeed);
        media.addEventListener('ratechange', handleMediaEvent, { capture: true, passive: true });
        media.addEventListener('loadedmetadata', handleMediaEvent, { capture: true, passive: true });
        media.addEventListener('play', handleMediaEvent, { capture: true, passive: true });
        media.addEventListener('pause', handleMediaEvent, { capture: true, passive: true });
    }

    function getAllMediaElements() {
        const results = new Set();
        document.querySelectorAll('video, audio').forEach(el => results.add(el));
        trackedShadowRoots.forEach(root => {
            if (root && root.querySelectorAll) {
                root.querySelectorAll('video, audio').forEach(el => results.add(el));
            }
        });
        return Array.from(results);
    }

    function rescanAllMedia() {
        rescanTimer = null;
        getAllMediaElements().forEach(trackMedia);
    }

    function scheduleRescan() {
        if (rescanTimer) return;
        rescanTimer = setTimeout(rescanAllMedia, 500);
    }

    function collectMediaFrom(node) {
        if (!node) return;
        if (node instanceof HTMLMediaElement) {
            trackMedia(node);
            return;
        }
        if (node.querySelectorAll) {
            node.querySelectorAll('video, audio').forEach(trackMedia);
        }
        if (node.shadowRoot) {
            observeRoot(node.shadowRoot);
        }
    }

    function observeRoot(root) {
        if (!root || trackedRoots.has(root)) return;
        trackedRoots.add(root);
        if (root instanceof ShadowRoot) trackedShadowRoots.add(root);

        addKeyHandlers(root);

        const target = root instanceof Document ? root.documentElement : root;
        if (!target) return;
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    collectMediaFrom(node);
                });
            });
            scheduleRescan();
        });
        observer.observe(target, { childList: true, subtree: true });
        collectMediaFrom(root);
    }

    function getShadowRootForElement(element) {
        if (!element) return null;
        if (element.shadowRoot) return element.shadowRoot;
        for (const root of trackedShadowRoots) {
            if (root.host === element) return root;
        }
        return null;
    }

    function findLeafActiveElement(root) {
        const active = root.activeElement;
        if (!active) return null;
        const shadowRoot = getShadowRootForElement(active);
        if (shadowRoot && shadowRoot.activeElement) {
            return findLeafActiveElement(shadowRoot);
        }
        return active;
    }

    function isEditableElement(element) {
        if (!element) return false;
        return element.tagName === 'INPUT' ||
            element.tagName === 'TEXTAREA' ||
            element.isContentEditable;
    }

    function handleKeyDown(e) {
        try {
            if (!isExtensionContextValid()) return;
            blockKeyUp = false;
            const active = findLeafActiveElement(document);
            if (isEditableElement(e.target) || isEditableElement(active)) return;
            const matched = toggleShortcuts.find((shortcut) => shortcut.keyCode === e.code);
            if (matched) {
                blockKeyUp = true;
                safeRuntimeSendMessage({ action: 'toggle-speed', speed: matched.speed });
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        } catch (_) {}
    }

    function handleKeyUp(e) {
        try {
            if (!isExtensionContextValid()) return;
            if (!blockKeyUp) return;
            blockKeyUp = false;
            e.preventDefault();
            e.stopImmediatePropagation();
        } catch (_) {}
    }

    function addKeyHandlers(root) {
        if (!root || trackedKeyRoots.has(root)) return;
        trackedKeyRoots.add(root);
        root.addEventListener('keydown', handleKeyDown, { capture: true });
        root.addEventListener('keyup', handleKeyUp, { capture: true });
    }

    observeRoot(document);

    // メッセージリスナー（ポップアップからの直接操作用など）
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'getSpeed') {
            sendResponse({ speed: currentSpeed });
            return true;
        }
        if (request.action === 'apply-speed') {
            const nextSpeed = toRate(Number(request.speed) / 100, currentSpeed);
            if (Number.isFinite(nextSpeed)) {
                currentSpeed = nextSpeed;
                applySpeedToAll(currentSpeed);
            }
            sendResponse({ success: true });
            return true;
        }
        if (request.action === 'get-media-count') {
            const count = document.querySelectorAll('video, audio').length;
            sendResponse({ count });
            return true;
        }
    });
})();
