document.addEventListener('DOMContentLoaded', () => {
    const { normalizeSettings, clamp, toInt } = window.VideoGearSpeed;
    if (!normalizeSettings) return;
    const speedStep = document.getElementById('speed-step');
    const speedMin = document.getElementById('speed-min');
    const speedMax = document.getElementById('speed-max');
    const presetInputs = document.querySelectorAll('.preset-input');
    const toggleKey = document.getElementById('toggle-key');
    const toggleSpeed = document.getElementById('toggle-speed');
    const extraShortcuts = document.getElementById('extra-shortcuts');
    const addShortcutBtn = document.getElementById('add-shortcut');
    const saveBtn = document.getElementById('save-btn');
    const saveStatus = document.getElementById('save-status');
    const openShortcuts = document.getElementById('open-chrome-shortcuts');
    const langToggleBtn = document.getElementById('options-lang-toggle');
    let currentLang = 'JP';

    const i18n = {
        JP: {
            title: 'ビデオギア 設定',
            optionsTitle: 'ビデオギア 設定',
            speedSettings: '再生速度の設定',
            speedStep: '増減ボタンの単位 (%)',
            speedMin: 'スライダー最小 (%)',
            speedMax: 'スライダー最大 (%)',
            presetPanel: '一発変速パネル (プリセット)',
            shortcuts: 'ショートカット',
            toggleSpeed: 'トグル時の速度 (%)',
            toggleKey: 'ページ内トグルキー（keydown）',
            toggleKeyPlaceholder: '押下して設定',
            addShortcutLabel: 'ショートカットを追加',
            removeShortcutLabel: 'サブショートカットを削除',
            mainShortcutLabel: 'メインショートカットキー',
            subShortcutLabel: 'サブショートカットキー',
            shortcutSettings: 'トグルキー設定',
            openShortcutSettings: 'ショートカット設定を開く',
            saveSettings: '設定を保存',
            saved: '保存しました。',
            langToggleLabel: 'EN'
        },
        EN: {
            title: 'Video Gear Settings',
            optionsTitle: 'Video Gear Settings',
            speedSettings: 'Playback Speed',
            speedStep: 'Step size (%)',
            speedMin: 'Slider min (%)',
            speedMax: 'Slider max (%)',
            presetPanel: 'Presets',
            shortcuts: 'Shortcuts',
            toggleSpeed: 'Toggle speed (%)',
            toggleKey: 'In-page toggle key (keydown)',
            toggleKeyPlaceholder: 'Press a key',
            addShortcutLabel: 'Add shortcut',
            removeShortcutLabel: 'Remove sub shortcut',
            mainShortcutLabel: 'Main shortcut key',
            subShortcutLabel: 'Sub shortcut key',
            shortcutSettings: 'Toggle key settings',
            openShortcutSettings: 'Open shortcut settings',
            saveSettings: 'Save settings',
            saved: 'Saved.',
            langToggleLabel: 'JP'
        }
    };

    const applyLanguage = () => {
        const dict = i18n[currentLang] || i18n.JP;
        document.title = dict.title;
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            if (!key || !dict[key]) return;
            el.textContent = dict[key];
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (!key || !dict[key]) return;
            el.setAttribute('placeholder', dict[key]);
        });
        document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
            const key = el.getAttribute('data-i18n-aria');
            if (!key || !dict[key]) return;
            el.setAttribute('aria-label', dict[key]);
        });
        document.querySelectorAll('[data-i18n="subShortcutLabel"]').forEach((el) => {
            const label = dict.subShortcutLabel || '';
            const suffix = el.dataset.suffix ? ` ${el.dataset.suffix}` : '';
            el.textContent = `${label}${suffix}`;
        });
    };

    const attachKeyCapture = (input) => {
        input.addEventListener('keydown', (e) => {
            e.preventDefault();
            if (!e.code) return;
            input.value = e.code;
        });
    };

    const renumberSubShortcuts = () => {
        const items = extraShortcuts.querySelectorAll('.sub-shortcut');
        items.forEach((item, idx) => {
            const title = item.querySelector('[data-i18n="subShortcutLabel"]');
            if (title) title.dataset.suffix = String(idx + 1);
        });
    };

    const buildShortcutSet = (shortcut, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'shortcut-card shortcut-set sub-shortcut';

        const header = document.createElement('div');
        header.className = 'subsection-header';
        const title = document.createElement('div');
        title.className = 'subsection-title';
        title.setAttribute('data-i18n', 'subShortcutLabel');
        title.dataset.suffix = String(index + 1);
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'icon-btn small';
        removeBtn.textContent = '-';
        removeBtn.setAttribute('data-i18n-aria', 'removeShortcutLabel');
        removeBtn.setAttribute('aria-label', (i18n[currentLang] || i18n.JP).removeShortcutLabel);
        removeBtn.addEventListener('click', () => {
            wrapper.remove();
            renumberSubShortcuts();
            applyLanguage();
        });
        header.append(title, removeBtn);

        const speedRow = document.createElement('div');
        speedRow.className = 'row';
        const speedLabel = document.createElement('label');
        speedLabel.setAttribute('data-i18n', 'toggleSpeed');
        const speedInput = document.createElement('input');
        speedInput.type = 'number';
        speedInput.className = 'extra-toggle-speed';
        speedInput.value = shortcut.speed;
        speedRow.append(speedLabel, speedInput);

        const keyRow = document.createElement('div');
        keyRow.className = 'row';
        const keyLabel = document.createElement('label');
        keyLabel.setAttribute('data-i18n', 'toggleKey');
        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.className = 'extra-toggle-key';
        keyInput.value = shortcut.keyCode;
        keyInput.setAttribute('data-i18n-placeholder', 'toggleKeyPlaceholder');
        keyRow.append(keyLabel, keyInput);

        attachKeyCapture(keyInput);
        wrapper.append(header, speedRow, keyRow);
        return wrapper;
    };

    const normalizeShortcutList = (shortcuts, fallbackSpeed) => {
        if (!Array.isArray(shortcuts)) return [];
        return shortcuts.map((shortcut) => {
            return {
                speed: clamp(toInt(shortcut?.speed, fallbackSpeed), 1, 2000),
                keyCode: typeof shortcut?.keyCode === 'string' ? shortcut.keyCode : ''
            };
        }).filter(shortcut => shortcut.keyCode);
    };

    // 保存された設定の読み込み
    chrome.storage.sync.get(['speedStep', 'speedMin', 'speedMax', 'presets', 'toggleKeyCode', 'toggleSpeed', 'toggleShortcuts', 'lang'], (data) => {
        const normalized = normalizeSettings(data || {});
        speedStep.value = normalized.speedStep;
        speedMin.value = normalized.speedMin;
        speedMax.value = normalized.speedMax;
        presetInputs.forEach((input, index) => {
            input.value = normalized.presets[index];
        });
        toggleKey.value = normalized.toggleKeyCode;
        toggleSpeed.value = normalized.toggleSpeed;
        extraShortcuts.textContent = '';
        normalizeShortcutList(data.toggleShortcuts, normalized.toggleSpeed).forEach((shortcut, index) => {
            const row = buildShortcutSet(shortcut, index);
            extraShortcuts.appendChild(row);
        });
        renumberSubShortcuts();
        if (data.lang) currentLang = data.lang;
        applyLanguage();
    });

    // 保存処理
    saveBtn.addEventListener('click', () => {
        const presets = Array.from(presetInputs).map(input => input.value);
        const normalized = normalizeSettings({
            speedStep: speedStep.value,
            speedMin: speedMin.value,
            speedMax: speedMax.value,
            presets,
            toggleKeyCode: toggleKey.value,
            toggleSpeed: toggleSpeed.value
        });
        const extraShortcutValues = Array.from(document.querySelectorAll('.sub-shortcut')).map((set) => {
            return {
                speed: set.querySelector('.extra-toggle-speed')?.value,
                keyCode: set.querySelector('.extra-toggle-key')?.value
            };
        });
        const normalizedShortcuts = normalizeShortcutList(extraShortcutValues, normalized.toggleSpeed);

        speedStep.value = normalized.speedStep;
        speedMin.value = normalized.speedMin;
        speedMax.value = normalized.speedMax;
        presetInputs.forEach((input, index) => {
            input.value = normalized.presets[index];
        });
        toggleSpeed.value = normalized.toggleSpeed;
        toggleKey.value = normalized.toggleKeyCode;
        extraShortcuts.textContent = '';
        normalizedShortcuts.forEach((shortcut, index) => {
            extraShortcuts.appendChild(buildShortcutSet(shortcut, index));
        });
        renumberSubShortcuts();
        applyLanguage();

        chrome.storage.sync.set({
            speedStep: normalized.speedStep,
            speedMin: normalized.speedMin,
            speedMax: normalized.speedMax,
            presets: normalized.presets,
            toggleKeyCode: normalized.toggleKeyCode,
            toggleSpeed: normalized.toggleSpeed,
            toggleShortcuts: normalizedShortcuts
        }, () => {
            saveStatus.textContent = (i18n[currentLang] || i18n.JP).saved;
            setTimeout(() => {
                saveStatus.textContent = '';
            }, 2000);
        });
    });

    // ショートカット設定画面を開く
    openShortcuts.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });

    langToggleBtn.addEventListener('click', () => {
        currentLang = currentLang === 'JP' ? 'EN' : 'JP';
        chrome.storage.sync.set({ lang: currentLang });
        applyLanguage();
    });

    attachKeyCapture(toggleKey);

    addShortcutBtn.addEventListener('click', () => {
        const normalized = normalizeSettings({ toggleSpeed: toggleSpeed.value });
        const index = extraShortcuts.querySelectorAll('.sub-shortcut').length;
        const row = buildShortcutSet({ speed: normalized.toggleSpeed, keyCode: '' }, index);
        extraShortcuts.appendChild(row);
        renumberSubShortcuts();
        applyLanguage();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        if (changes.lang) {
            currentLang = changes.lang.newValue || 'JP';
            applyLanguage();
        }
    });
});
