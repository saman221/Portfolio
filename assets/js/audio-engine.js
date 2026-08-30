const MOBILE_QUERY = '(max-width: 820px), (hover: none), (pointer: coarse)';

export const createSoundEngine = () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const adaptiveQuery = window.matchMedia(MOBILE_QUERY);
    let state = AudioContextClass ? 'waiting' : 'unavailable';
    let context = null;
    let masterGain = null;
    let effectsGain = null;
    let destroyed = false;
    let activating = false;
    let suspendTimer = 0;
    const lastPlayed = new Map();

    const setState = (nextState) => {
        state = nextState;
        document.documentElement.dataset.soundState = nextState;
    };

    const deviceScale = () => adaptiveQuery.matches ? 0.78 : 1;

    const rampMaster = (enabled, duration = 0.22) => {
        if (!context || !masterGain) return;
        const now = context.currentTime;
        const target = enabled ? 0.42 * deviceScale() : 0;
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(masterGain.gain.value, now);
        masterGain.gain.linearRampToValueAtTime(target, now + duration);
    };

    const ensureContext = () => {
        if (context || !AudioContextClass || destroyed) return Boolean(context);

        try {
            context = new AudioContextClass();
            masterGain = context.createGain();
            effectsGain = context.createGain();
            const compressor = context.createDynamicsCompressor();

            masterGain.gain.value = 0;
            effectsGain.gain.value = 0.58;
            compressor.threshold.value = -20;
            compressor.knee.value = 20;
            compressor.ratio.value = 10;
            compressor.attack.value = 0.006;
            compressor.release.value = 0.22;

            effectsGain.connect(masterGain);
            masterGain.connect(compressor).connect(context.destination);
            return true;
        } catch {
            context = null;
            setState('unavailable');
            return false;
        }
    };

    const playVoice = ({ from, to = from, duration = 0.1, delay = 0, level = 0.16, type = 'sine' }) => {
        if (state !== 'on' || !context || context.state !== 'running') return;
        const start = context.currentTime + delay;
        const oscillator = context.createOscillator();
        const voiceGain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(from, start);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(to, 1), start + duration);
        voiceGain.gain.setValueAtTime(0.0001, start);
        voiceGain.gain.exponentialRampToValueAtTime(level, start + Math.min(0.018, duration * 0.28));
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(voiceGain).connect(effectsGain);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
    };

    const canPlay = (name, cooldown) => {
        const now = performance.now();
        const previous = lastPlayed.get(name) || 0;
        if (now - previous < cooldown) return false;
        lastPlayed.set(name, now);
        return true;
    };

    const play = (name, detail = {}) => {
        if (state !== 'on') return;

        switch (name) {
            case 'hover':
                if (adaptiveQuery.matches || !canPlay(name, 140)) return;
                playVoice({ from: 680, to: 980, duration: 0.08, level: 0.15 });
                break;
            case 'card-hover':
                if (adaptiveQuery.matches || !canPlay(name, 240)) return;
                playVoice({ from: 174.61, to: 261.63, duration: 0.18, level: 0.16, type: 'triangle' });
                playVoice({ from: 349.23, to: 523.25, duration: 0.15, delay: 0.045, level: 0.09 });
                break;
            case 'tap':
                if (!canPlay(name, 70)) return;
                playVoice({ from: 280, to: 470, duration: 0.095, level: 0.24, type: 'triangle' });
                playVoice({ from: 560, to: 820, duration: 0.07, delay: 0.025, level: 0.1 });
                break;
            case 'menu-open':
                if (!canPlay('menu', 150)) return;
                playVoice({ from: 190, to: 560, duration: 0.18, level: 0.23, type: 'triangle' });
                playVoice({ from: 330, to: 740, duration: 0.15, delay: 0.04, level: 0.14 });
                playVoice({ from: 660, to: 980, duration: 0.11, delay: 0.085, level: 0.07 });
                break;
            case 'menu-close':
                if (!canPlay('menu', 150)) return;
                playVoice({ from: 620, to: 210, duration: 0.17, level: 0.22, type: 'triangle' });
                playVoice({ from: 880, to: 440, duration: 0.12, delay: 0.025, level: 0.1 });
                break;
            case 'section':
                if (!canPlay(name, 700)) return;
                playVoice({ from: 164.81, to: 246.94, duration: 0.28, level: 0.18, type: 'triangle' });
                playVoice({ from: 246.94, to: 369.99, duration: 0.24, delay: 0.065, level: 0.12 });
                playVoice({ from: 493.88, to: 739.99, duration: 0.18, delay: 0.13, level: 0.065 });
                break;
            case 'architecture': {
                if (!canPlay(name, 360)) return;
                const index = Number.isFinite(detail.index) ? detail.index : 0;
                const frequency = 246.94 * (1 + (index * 0.16));
                playVoice({ from: frequency, to: frequency * 1.38, duration: 0.19, level: 0.2, type: 'triangle' });
                playVoice({ from: frequency * 2, to: frequency * 2.36, duration: 0.13, delay: 0.045, level: 0.08 });
                break;
            }
            case 'power':
                playVoice({ from: 140, to: 520, duration: 0.28, level: 0.24, type: 'triangle' });
                playVoice({ from: 280, to: 780, duration: 0.23, delay: 0.055, level: 0.14 });
                playVoice({ from: 560, to: 1040, duration: 0.17, delay: 0.12, level: 0.07 });
                break;
            default:
                break;
        }
    };

    const removeGestureListeners = () => {
        document.removeEventListener('click', handleFirstGesture, true);
        document.removeEventListener('keydown', handleFirstGesture, true);
    };

    const enable = async () => {
        if (activating) return false;
        activating = true;
        if (!ensureContext()) {
            activating = false;
            removeGestureListeners();
            return false;
        }

        try {
            window.clearTimeout(suspendTimer);
            await context.resume();
            setState('on');
            rampMaster(!document.hidden);
            removeGestureListeners();
            window.setTimeout(() => play('power'), 45);
            return true;
        } catch {
            setState('unavailable');
            return false;
        } finally {
            activating = false;
        }
    };

    const unlock = () => {
        if (state === 'on') return Promise.resolve(true);
        if (state !== 'waiting') return Promise.resolve(false);
        return enable();
    };

    async function handleFirstGesture() {
        if (state !== 'waiting') {
            removeGestureListeners();
            return;
        }

        await unlock();
    }

    const handleVisibility = () => {
        if (!context) return;

        if (document.hidden) {
            rampMaster(false, 0.12);
            window.clearTimeout(suspendTimer);
            suspendTimer = window.setTimeout(() => {
                context?.suspend().catch(() => {});
            }, 150);
            return;
        }

        context.resume()
            .then(() => {
                setState('on');
                rampMaster(true, 0.2);
            })
            .catch(() => setState('waiting'));
    };

    const handleAdaptiveChange = () => {
        if (state === 'on') rampMaster(true, 0.18);
    };

    const destroy = () => {
        destroyed = true;
        removeGestureListeners();
        document.removeEventListener('visibilitychange', handleVisibility);
        adaptiveQuery.removeEventListener?.('change', handleAdaptiveChange);
        window.clearTimeout(suspendTimer);
        context?.close().catch(() => {});
    };

    setState(state);
    document.addEventListener('visibilitychange', handleVisibility);
    adaptiveQuery.addEventListener?.('change', handleAdaptiveChange);

    if (state === 'waiting') {
        document.addEventListener('click', handleFirstGesture, true);
        document.addEventListener('keydown', handleFirstGesture, true);
    }

    return { play, unlock, destroy, getState: () => state };
};
