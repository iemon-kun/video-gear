(function () {
    const DEFAULTS = {
        step: 10,
        min: 50,
        max: 250,
        presets: [50, 100, 125, 150, 175, 200]
    };

    const toInt = (value, fallback) => {
        const parsed = Number.parseInt(value, 10);
        return Number.isNaN(parsed) ? fallback : parsed;
    };

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const normalizeRange = (minValue, maxValue, minFallback, maxFallback) => {
        const min = clamp(toInt(minValue, minFallback), 1, 2000);
        const max = clamp(toInt(maxValue, maxFallback), 1, 2000);
        return {
            min: Math.min(min, max),
            max: Math.max(min, max)
        };
    };

    const normalizePresets = (presets, min, max) => {
        const source = Array.isArray(presets) ? presets : DEFAULTS.presets;
        return DEFAULTS.presets.map((fallback, index) => {
            return clamp(toInt(source[index], fallback), min, max);
        });
    };

    const normalizeSpeedConfig = (input) => {
        const { min, max } = normalizeRange(input.speedMin, input.speedMax, DEFAULTS.min, DEFAULTS.max);
        return {
            step: clamp(toInt(input.speedStep, DEFAULTS.step), 1, 100),
            min,
            max,
            presets: normalizePresets(input.presets, min, max),
            currentLang: input.lang || 'JP'
        };
    };

    const normalizeSettings = (input) => {
        const { min, max } = normalizeRange(input.speedMin, input.speedMax, DEFAULTS.min, DEFAULTS.max);
        return {
            speedStep: clamp(toInt(input.speedStep, DEFAULTS.step), 1, 100),
            speedMin: min,
            speedMax: max,
            presets: normalizePresets(input.presets, min, max),
            toggleSpeed: clamp(toInt(input.toggleSpeed, 200), 1, 2000),
            toggleKeyCode: typeof input.toggleKeyCode === 'string' ? input.toggleKeyCode : 'F13'
        };
    };

    globalThis.VideoGearSpeed = {
        DEFAULTS,
        clamp,
        toInt,
        normalizeRange,
        normalizePresets,
        normalizeSpeedConfig,
        normalizeSettings
    };
})();
