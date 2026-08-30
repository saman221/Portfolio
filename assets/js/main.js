import { initArchitectureScene } from './three-scene.js';
import { createSoundEngine } from './audio-engine.js';

const body = document.body;
const header = document.querySelector('[data-header]');
const menuToggle = document.querySelector('[data-menu-toggle]');
const mobileMenu = document.querySelector('[data-mobile-menu]');
const progressBar = document.querySelector('[data-scroll-progress]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const heroVideo = document.querySelector('[data-hero-video]');
const architectureStage = document.querySelector('[data-architecture-stage]');
const architectureSteps = [...document.querySelectorAll('[data-architecture-step]')];
const architectureMarkers = [...document.querySelectorAll('[data-architecture-marker]')];
const architectureDepth = document.querySelector('[data-architecture-depth]');
const sound = createSoundEngine();

const closeMenu = ({ returnFocus = false, withSound = true } = {}) => {
    if (!menuToggle || !mobileMenu) return;
    const wasOpen = menuToggle.getAttribute('aria-expanded') === 'true';

    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'باز کردن منو');
    mobileMenu.hidden = true;
    header?.classList.remove('menu-is-open');
    body.classList.remove('menu-open');
    if (wasOpen && withSound) sound.play('menu-close');

    if (returnFocus) menuToggle.focus();
};

const openMenu = () => {
    if (!menuToggle || !mobileMenu) return;
    if (menuToggle.getAttribute('aria-expanded') === 'true') return;

    menuToggle.setAttribute('aria-expanded', 'true');
    menuToggle.setAttribute('aria-label', 'بستن منو');
    mobileMenu.hidden = false;
    header?.classList.add('menu-is-open');
    body.classList.add('menu-open');
    sound.play('menu-open');
};

menuToggle?.addEventListener('click', async () => {
    await sound.unlock();
    const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
    isOpen ? closeMenu() : openMenu();
});

mobileMenu?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => closeMenu({ withSound: false }));
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuToggle?.getAttribute('aria-expanded') === 'true') {
        closeMenu({ returnFocus: true });
    }
});

window.addEventListener('resize', () => {
    if (window.innerWidth > 1080) closeMenu({ withSound: false });
}, { passive: true });

const revealItems = [...document.querySelectorAll('[data-reveal]')];

if (reducedMotion.matches || !('IntersectionObserver' in window)) {
    revealItems.forEach((item) => item.classList.add('is-visible'));
} else {
    document.querySelectorAll('.hero [data-reveal]').forEach((item, index) => {
        item.style.transitionDelay = `${Math.min(index * 75, 300)}ms`;
    });

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    revealItems.forEach((item) => revealObserver.observe(item));
}

const sections = [...document.querySelectorAll('main section[id]')];
const navLinks = [...document.querySelectorAll('.desktop-nav a')];
let activeSectionId = null;

if ('IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver((entries) => {
        const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) return;

        if (activeSectionId && activeSectionId !== visible.target.id) sound.play('section');
        activeSectionId = visible.target.id;

        navLinks.forEach((link) => {
            const active = link.getAttribute('href') === `#${visible.target.id}`;
            link.classList.toggle('is-active', active);
            if (active) link.setAttribute('aria-current', 'true');
            else link.removeAttribute('aria-current');
        });
    }, { rootMargin: '-35% 0px -52% 0px', threshold: [0, 0.2, 0.6] });

    sections.forEach((section) => sectionObserver.observe(section));
}

let scrollTicking = false;
let activeArchitectureIndex = null;

const updateArchitectureNarrative = () => {
    if (!architectureSteps.length) return;

    const focusLine = window.innerHeight * (window.innerWidth <= 820 ? 0.42 : 0.52);
    let activeIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    architectureSteps.forEach((step, index) => {
        const rect = step.getBoundingClientRect();
        const center = rect.top + (rect.height / 2);
        const distance = Math.abs(center - focusLine);

        if (distance < closestDistance) {
            closestDistance = distance;
            activeIndex = index;
        }
    });

    architectureSteps.forEach((step, index) => step.classList.toggle('is-active', index === activeIndex));
    architectureMarkers.forEach((marker, index) => marker.classList.toggle('is-active', index === activeIndex));

    if (activeArchitectureIndex !== null && activeArchitectureIndex !== activeIndex) {
        sound.play('architecture', { index: activeIndex });
    }
    activeArchitectureIndex = activeIndex;

    if (architectureDepth) architectureDepth.textContent = (activeIndex * 32.4).toFixed(2).padStart(5, '0');
    if (architectureStage && !architectureStage.classList.contains('is-webgl-ready')) {
        const fallbackProgress = activeIndex / Math.max(architectureSteps.length - 1, 1);
        architectureStage.dataset.architectureProgress = fallbackProgress.toFixed(3);
        architectureStage.style.setProperty('--arch-progress', fallbackProgress.toFixed(3));
    }
};

const updateScrollState = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollable = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    const progress = Math.min(scrollTop / scrollable, 1);

    header?.classList.toggle('is-scrolled', scrollTop > 18);
    if (progressBar) progressBar.style.transform = `scaleX(${progress})`;
    updateArchitectureNarrative();
    scrollTicking = false;
};

window.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    window.requestAnimationFrame(updateScrollState);
}, { passive: true });

updateScrollState();

const depthCards = [...document.querySelectorAll('[data-depth-card]')];
const canUseDepth = window.innerWidth > 820 && window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reducedMotion.matches;

if (canUseDepth) {
    depthCards.forEach((card) => {
        let depthFrame = 0;
        let latestPointer = null;

        const renderDepth = () => {
            if (!latestPointer) return;

            const rect = card.getBoundingClientRect();
            const x = Math.min(Math.max((latestPointer.clientX - rect.left) / rect.width, 0), 1);
            const y = Math.min(Math.max((latestPointer.clientY - rect.top) / rect.height, 0), 1);
            const normalizedX = (x - 0.5) * 2;
            const normalizedY = (y - 0.5) * 2;

            card.style.setProperty('--depth-rx', `${(-normalizedY * 4.5).toFixed(2)}deg`);
            card.style.setProperty('--depth-ry', `${(normalizedX * 5.5).toFixed(2)}deg`);
            card.style.setProperty('--depth-shift-x', `${(normalizedX * 3).toFixed(2)}px`);
            card.style.setProperty('--depth-shift-y', `${(normalizedY * 3).toFixed(2)}px`);
            card.style.setProperty('--depth-glow-x', `${(x * 100).toFixed(1)}%`);
            card.style.setProperty('--depth-glow-y', `${(y * 100).toFixed(1)}%`);
            depthFrame = 0;
        };

        card.addEventListener('pointermove', (event) => {
            latestPointer = event;
            card.classList.add('is-depth-active');
            if (!depthFrame) depthFrame = window.requestAnimationFrame(renderDepth);
        }, { passive: true });

        card.addEventListener('pointerleave', () => {
            latestPointer = null;
            if (depthFrame) window.cancelAnimationFrame(depthFrame);
            depthFrame = 0;
            card.classList.remove('is-depth-active');
            card.style.removeProperty('--depth-rx');
            card.style.removeProperty('--depth-ry');
            card.style.removeProperty('--depth-shift-x');
            card.style.removeProperty('--depth-shift-y');
            card.style.removeProperty('--depth-glow-x');
            card.style.removeProperty('--depth-glow-y');
        }, { passive: true });
    });
}

const soundClickTargets = [...document.querySelectorAll('a, button:not([data-menu-toggle])')];
const soundHoverTargets = [...document.querySelectorAll('.brand, .desktop-nav a, .button, .contact-link, .site-footer a')];
const soundCardTargets = [...document.querySelectorAll('.service-card, .project-card, .principle, .capabilities span')];

soundClickTargets.forEach((target) => {
    target.addEventListener('click', async () => {
        await sound.unlock();
        sound.play('tap');
    });
});

soundHoverTargets.forEach((target) => {
    target.addEventListener('pointerenter', () => sound.play('hover'), { passive: true });
    target.addEventListener('focusin', () => sound.play('hover'));
});

soundCardTargets.forEach((target) => {
    target.addEventListener('pointerenter', () => sound.play('card-hover'), { passive: true });
});

const currentYear = document.querySelector('[data-current-year]');
if (currentYear) currentYear.textContent = new Intl.NumberFormat('en', { useGrouping: false }).format(new Date().getFullYear());

if (heroVideo) {
    let heroVideoStarted = false;

    const resetHeroVideo = () => {
        if (heroVideo.readyState >= HTMLMediaElement.HAVE_METADATA) {
            heroVideo.currentTime = 0;
            return;
        }

        heroVideo.addEventListener('loadedmetadata', () => {
            heroVideo.currentTime = 0;
        }, { once: true });
    };

    const startHeroVideo = () => {
        if (reducedMotion.matches) {
            heroVideo.pause();
            resetHeroVideo();
            return;
        }

        heroVideoStarted = true;
        const playback = heroVideo.play();
        playback?.catch(() => {});
    };

    const handleVisibilityChange = () => {
        if (document.hidden) {
            heroVideo.pause();
            return;
        }

        if (heroVideoStarted && !heroVideo.ended && !reducedMotion.matches) {
            const playback = heroVideo.play();
            playback?.catch(() => {});
        }
    };

    const handleMotionPreferenceChange = () => {
        if (!reducedMotion.matches) return;

        heroVideo.pause();
        resetHeroVideo();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    reducedMotion.addEventListener?.('change', handleMotionPreferenceChange);

    if (document.readyState === 'complete') startHeroVideo();
    else window.addEventListener('load', startHeroVideo, { once: true });
}

if (architectureStage && !reducedMotion.matches) {
    const startArchitectureScene = async () => {
        try {
            const initialized = await initArchitectureScene(architectureStage);
            if (initialized) architectureStage.classList.add('is-webgl-ready');
        } catch (error) {
            console.warn('Architecture scene unavailable; static fallback is active.', error);
        }
    };

    window.requestAnimationFrame(startArchitectureScene);
}

window.addEventListener('pagehide', (event) => {
    if (!event.persisted) sound.destroy();
});
