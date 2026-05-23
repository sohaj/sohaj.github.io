/* ============================================
   ELEGANT ANIMATIONS - Sohaj Singh Brar Portfolio
   Clean, Smooth, Professional
   ============================================ */

(function() {
  'use strict';

  // Self-heal safety net: no matter what happens (delayed DOMContentLoaded,
  // a script error, a slow CDN, etc.), force the page loader to hide after
  // a max timeout so the page is never permanently stuck behind the loader.
  var LOADER_MAX_MS = 3000;
  var heroAnimationTriggered = false;
  // Pages with the dot-portrait intro (#hero-dot-stage) gate hero
  // reveal on the `dot-bust:assembled` event instead of the legacy
  // letter loader. We detect once at module load so every callback
  // below can branch consistently.
  var hasDotIntro = !!document.querySelector('#hero-dot-stage');
  function forceHideLoader() {
    var loader = document.querySelector('.page-loader');
    if (loader && !loader.classList.contains('loaded')) {
      loader.classList.add('loaded');
    }
    // On the dot-portrait intro flow, the inline <head> script in
    // index.html (window.__sohajRevealIntro) owns the reveal — don't
    // pre-empt it from here, or the hero text will pop in before the
    // dots have assembled.
    if (hasDotIntro) {
      if (typeof window.__sohajRevealIntro === 'function') {
        try { window.__sohajRevealIntro(); } catch (e) { /* no-op */ }
      }
      return;
    }
    if (!heroAnimationTriggered && typeof triggerHeroAnimation === 'function') {
      try { triggerHeroAnimation(); } catch (e) { /* no-op */ }
    }
  }
  // Skip the 3s legacy safety net on the dot-intro flow — the inline
  // script in index.html has its own 5s safety net that's coordinated
  // with the dot-bust:assembled event.
  if (!hasDotIntro) {
    setTimeout(forceHideLoader, LOADER_MAX_MS);
  }

  // Expose triggerHeroAnimation on window so the inline intro-reveal
  // script in index.html can call it once dot-bust:assembled fires
  // (it's defined later in this IIFE but hoisted by the function
  // declaration; we publish it inside DOMContentLoaded below).

  document.addEventListener('DOMContentLoaded', function() {
    try { initPageLoader(); } catch (e) { forceHideLoader(); }
    try { initNavbarScroll(); } catch (e) {}
    try { initSmoothScroll(); } catch (e) {}
    try { initScrollReveal(); } catch (e) {}
    try { initMobileMenu(); } catch (e) {}
    try { initProjectMediaAutoplay(); } catch (e) {}
    try { initYouTubeAutoplay(); } catch (e) {}
    try { initWorkHorizontal(); } catch (e) {}
    try { initWorkCardLift(); } catch (e) {}
    try { initIntroReveal(); } catch (e) {}
    // Portrait animation now controlled by typed.js in typewriter.js
    // initPortraitScrollAnimation();
  });

  /* ============================================
     PROJECT MEDIA AUTOPLAY
     Plays project videos when they scroll into view
     ============================================ */
  function initProjectMediaAutoplay() {
    const videos = document.querySelectorAll('.project-row video');
    if (!videos.length || !('IntersectionObserver' in window)) return;

    videos.forEach(function(video) {
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('muted', '');
      video.loop = true;
      video.preload = 'metadata';
    });

    const videoObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        const video = entry.target;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
          const playPromise = video.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(function() { /* autoplay blocked, ignore */ });
          }
        } else {
          if (!video.paused) video.pause();
        }
      });
    }, { threshold: [0, 0.4, 0.75] });

    videos.forEach(function(video) {
      videoObserver.observe(video);
    });
  }

  /* ============================================
     YOUTUBE AUTOPLAY ON SCROLL
     Lazy-loads YouTube iframes (with [data-yt-id]) when
     they enter the viewport, plays them muted/looped, and
     pauses via the IFrame Player API when they leave view.
     ============================================ */
  function initYouTubeAutoplay() {
    const iframes = document.querySelectorAll('iframe[data-yt-id]');
    if (!iframes.length || !('IntersectionObserver' in window)) return;

    function buildSrc(id) {
      const params = [
        'autoplay=1',
        'mute=1',
        'loop=1',
        'playlist=' + id,
        'controls=0',
        'modestbranding=1',
        'rel=0',
        'playsinline=1',
        'enablejsapi=1',
        'iv_load_policy=3',
        'disablekb=1',
        'fs=0',
        'cc_load_policy=0',
        'showinfo=0'
      ].join('&');
      return 'https://www.youtube-nocookie.com/embed/' + id + '?' + params;
    }

    function postCommand(iframe, func) {
      try {
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: func, args: [] }),
          '*'
        );
      } catch (e) { /* iframe not ready yet, ignore */ }
    }

    // Once a YouTube iframe has loaded its real src, we leave it
    // alone — re-issuing playVideo on every scroll-in is what makes
    // YouTube flash its center-controls overlay. Letting it loop
    // continuously costs essentially nothing and keeps the UI clean.
    const ytObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        const iframe = entry.target;
        const id = iframe.getAttribute('data-yt-id');
        if (!id) return;

        const isLoaded = iframe.src.indexOf('/embed/' + id) !== -1;
        if (!isLoaded && entry.isIntersecting && entry.intersectionRatio >= 0.4) {
          iframe.src = buildSrc(id);

          // Fade the poster out only after autoplay has had time
          // to settle — otherwise the user sees YouTube's initial
          // load screen + play overlay through the gap.
          const wrap = iframe.closest('.work-card-yt-wrap');
          if (wrap) {
            // Wait for the iframe document to load, then a small grace
            // period for YouTube's player UI to fade away.
            iframe.addEventListener('load', function onLoad() {
              setTimeout(function() {
                wrap.classList.add('is-ready');
              }, 1500);
              iframe.removeEventListener('load', onLoad);
            });
          }

          // Once src is set, we never need to observe it again.
          ytObserver.unobserve(iframe);
        }
      });
    }, { threshold: [0, 0.4, 0.75] });

    iframes.forEach(function(iframe) {
      ytObserver.observe(iframe);
    });
  }

  /* ============================================
     HORIZONTAL FEATURED WORK GALLERY
     Translates vertical scroll into horizontal pan of a card track.
     - Section is N × 100vh tall (gives scroll budget)
     - Pin is sticky 100vh containing a horizontal flex track
     - Scroll progress through section maps to translateX of track
     - Cards' background videos auto-play when intersecting viewport
     ============================================ */
  function initWorkHorizontal() {
    const section = document.getElementById('work-horizontal');
    const track = document.getElementById('work-horizontal-track');
    if (!section || !track) return;

    const isMobile = window.matchMedia('(max-width: 767px)').matches;

    /* Scroll-driven focus: blur text on cards that aren't centered.
       Each card gets a --text-blur CSS variable based on how much of
       it is currently visible in the viewport. The CSS in modern.css
       reads that variable on .work-card-title / -eyebrow / -reveal. */
    const MAX_TEXT_BLUR = 12;       // px — strongest blur for off-screen cards
    const FOCUS_THRESHOLD = 0.55;   // ratio above which blur snaps to 0
                                     // (~half-visible already reads as crisp)
    function updateCardBlur() {
      const cards = section.querySelectorAll('.work-card');
      const vw = window.innerWidth;
      cards.forEach(function (card) {
        const r = card.getBoundingClientRect();
        const w = r.width;
        if (!w) return;
        const visibleLeft = Math.max(0, r.left);
        const visibleRight = Math.min(vw, r.right);
        const visibleWidth = Math.max(0, visibleRight - visibleLeft);
        const ratio = visibleWidth / w;
        // Snap to 0 once the card is mostly in view so the focused
        // card never has any residual softness on it.
        let blur;
        if (ratio >= FOCUS_THRESHOLD) {
          blur = 0;
        } else {
          // Map ratio [0..FOCUS_THRESHOLD] → blur [MAX..0] with a
          // gentle ease so the text "resolves" smoothly.
          const t = 1 - (ratio / FOCUS_THRESHOLD);
          const eased = t * t; // ease-in: stays sharper longer near focus
          blur = eased * MAX_TEXT_BLUR;
        }
        card.style.setProperty('--text-blur', blur.toFixed(2) + 'px');
      });
    }

    // Set up video autoplay for cards in view
    const videos = section.querySelectorAll('video[data-work-video]');
    videos.forEach(function(v) {
      v.muted = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('muted', '');
      v.loop = true;
      v.preload = 'metadata';
    });

    if ('IntersectionObserver' in window) {
      const videoObs = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          const v = entry.target;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
            const p = v.play();
            if (p && typeof p.catch === 'function') p.catch(function() {});
          } else if (!v.paused) {
            v.pause();
          }
        });
      }, { threshold: [0, 0.25, 0.6] });
      videos.forEach(function(v) { videoObs.observe(v); });

      // Hide the fixed nav whenever the work section is on screen.
      const navObs = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          document.body.classList.toggle('is-in-work', entry.isIntersecting);
        });
      }, { threshold: 0 });
      navObs.observe(section);
    }

    // Run blur once at startup and on resize so the initial state is correct
    // regardless of device. (Mobile keeps using native scroll below.)
    requestAnimationFrame(updateCardBlur);
    window.addEventListener('resize', function () {
      requestAnimationFrame(updateCardBlur);
    });

    // On mobile we use native horizontal scroll on the pin — wire blur
    // updates to the pin's scroll event, then bail out of scroll-jack.
    if (isMobile) {
      const pin = section.querySelector('.work-horizontal-pin');
      if (pin) {
        let mRaf = null;
        pin.addEventListener('scroll', function () {
          if (mRaf) return;
          mRaf = requestAnimationFrame(function () {
            updateCardBlur();
            mRaf = null;
          });
        }, { passive: true });
      }
      window.addEventListener('scroll', function () {
        requestAnimationFrame(updateCardBlur);
      }, { passive: true });
      return;
    }

    // Auto-size section height: 100vh of pin + horizontal scroll budget.
    // We make scroll budget = trackWidth - viewportWidth so user scrolls
    // exactly that much vertically to pan the full track horizontally.
    function recalcHeight() {
      const trackWidth = track.scrollWidth;
      const viewportWidth = window.innerWidth;
      const horizontalScroll = Math.max(0, trackWidth - viewportWidth);
      // 100vh for the initial pinned view + however much horizontal travel we need.
      section.style.height = (window.innerHeight + horizontalScroll) + 'px';
    }

    function update() {
      const rect = section.getBoundingClientRect();
      const sectionHeight = section.offsetHeight;
      const viewportHeight = window.innerHeight;
      const scrollableY = sectionHeight - viewportHeight;
      if (scrollableY <= 0) {
        track.style.transform = 'translateX(0)';
        updateCardBlur();
        return;
      }
      const progress = Math.max(0, Math.min(1, -rect.top / scrollableY));
      const trackWidth = track.scrollWidth;
      const viewportWidth = window.innerWidth;
      const horizontalScroll = Math.max(0, trackWidth - viewportWidth);
      track.style.transform = 'translateX(' + (-progress * horizontalScroll) + 'px)';
      updateCardBlur();
    }

    let rafId = null;
    function onScroll() {
      if (rafId) return;
      rafId = requestAnimationFrame(function() {
        update();
        rafId = null;
      });
    }

    // Recalculate on resize (also re-checks if we should switch to mobile mode)
    function onResize() {
      const nowMobile = window.matchMedia('(max-width: 767px)').matches;
      if (nowMobile) {
        section.style.height = '';
        track.style.transform = '';
        return;
      }
      recalcHeight();
      update();
    }

    // Wait for media to load so scrollWidth is accurate
    function setup() {
      recalcHeight();
      update();
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    // Re-measure once images/videos report dimensions
    window.addEventListener('load', setup);
    setup();

    /* Horizontal-scroll passthrough.
       When the pin is engaged (user is "inside" the work section), a
       horizontal trackpad swipe / Shift+wheel would normally do nothing
       useful — there's no native horizontal scroll because the pin has
       overflow:hidden. Translate horizontal wheel deltas into vertical
       page scroll so the existing scroll-jack logic pans the cards.
       Outside the pin range we let the browser do its normal thing. */
    window.addEventListener('wheel', function (e) {
      if (window.matchMedia('(max-width: 767px)').matches) return;
      var rect = section.getBoundingClientRect();
      var vh = window.innerHeight;
      var inPinRange = rect.top <= 0 && rect.bottom > vh;
      if (!inPinRange) return;

      var ax = Math.abs(e.deltaX);
      var ay = Math.abs(e.deltaY);
      if (ax <= ay || ax < 1) return;

      var dx = e.deltaX;
      var pageY = window.pageYOffset || document.documentElement.scrollTop;
      var sectionTop = pageY + rect.top;
      var sectionBottom = sectionTop + section.offsetHeight - vh;
      var nextY = pageY + dx;

      // If the horizontal scroll would carry the user past either edge
      // of the section, let the browser handle the residual naturally
      // so we don't trap them at the boundary.
      if (nextY < sectionTop && dx < 0) return;
      if (nextY > sectionBottom && dx > 0) return;

      e.preventDefault();
      window.scrollBy(0, dx);
    }, { passive: false });
  }

  /* ============================================
     WORK CARD AUTO-LIFT CALIBRATION
     ============================================
     Each work-card hover lifts the title + eyebrow up by `--title-lift`
     to expose the description + CTA underneath. The visible gap between
     the title's bottom and the description's top equals
     `--title-lift − reveal_block_height`. Because descriptions vary in
     length (1–4 lines, plus a 38px CTA pill below), a single fixed
     `--title-lift` either leaves a yawning gap on short cards or makes
     the title overlap the description on long ones.

     This function measures each card's reveal block once layout is
     stable, then sets `--title-lift` per-card so the gap is identical
     everywhere (matches the WhatsApp cards: ~14px). Re-runs on resize
     because the description font is `clamp()`-responsive. */
  function initWorkCardLift() {
    const cards = document.querySelectorAll('.work-card');
    if (!cards.length) return;

    const TARGET_GAP = 14; // px between title bottom and description top, on hover

    function calibrate() {
      cards.forEach(function(card) {
        const reveal = card.querySelector('.work-card-reveal');
        if (!reveal) return;
        // Reveal is `display: flex` with `opacity: 0` (not display:none),
        // so it has a measurable layout height even when hidden.
        const h = reveal.getBoundingClientRect().height;
        if (h <= 0) return; // not laid out yet — skip; resize handler will catch it
        card.style.setProperty('--title-lift', Math.ceil(h + TARGET_GAP) + 'px');
      });
    }

    // Initial pass after layout settles. rAF + setTimeout(0) catches the
    // case where web fonts haven't applied yet.
    requestAnimationFrame(function() {
      calibrate();
      setTimeout(calibrate, 50);
    });

    // Recalibrate when fonts finish loading (description height shifts).
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(calibrate).catch(function() {});
    }

    // Recalibrate on resize (description uses clamp() so its font scales
    // with viewport width — height per line changes accordingly).
    let resizeTimer = null;
    window.addEventListener('resize', function() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(calibrate, 120);
    }, { passive: true });
  }

  /* Legacy immersive controller — no longer wired to DOMContentLoaded
     but kept as a no-op placeholder in case old markup persists. */
  function initImmersiveBgAutoplay_LEGACY_UNUSED() {
    const work = document.getElementById('immersive-work');
    const bgStage = document.getElementById('immersive-stage-bg');
    const ctxStage = document.getElementById('immersive-stage-context');
    const context = document.getElementById('immersive-context');
    const projects = document.querySelectorAll('.immersive-project');
    const slides = document.querySelectorAll('.immersive-bg-slide');
    const videos = document.querySelectorAll('video[data-immersive-video]');

    if (!work || !bgStage || !ctxStage || !context || !projects.length || !slides.length) return;

    // Prep all bg videos for autoplay
    videos.forEach(function(v) {
      v.muted = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('muted', '');
      v.loop = true;
      v.preload = 'metadata';
    });

    function renderContext(project) {
      const eyebrow = project.dataset.eyebrow || '';
      const summary = project.dataset.summary || '';
      const s1v = project.dataset.stat1Value || '';
      const s1l = project.dataset.stat1Label || '';
      const s2v = project.dataset.stat2Value || '';
      const s2l = project.dataset.stat2Label || '';
      const linkHref = project.dataset.linkHref || '#';
      const linkText = project.dataset.linkText || 'Learn more →';

      context.innerHTML =
        '<span class="immersive-eyebrow">' + eyebrow + '</span>' +
        '<p class="immersive-summary">' + summary + '</p>' +
        '<div class="immersive-stats">' +
          '<span><strong>' + s1v + '</strong> ' + s1l + '</span>' +
          '<span><strong>' + s2v + '</strong> ' + s2l + '</span>' +
        '</div>' +
        '<a href="' + linkHref + '" target="_blank" rel="noopener" class="immersive-link">' + linkText + '</a>';
    }

    function setActive(index) {
      // Toggle bg slides
      slides.forEach(function(slide, i) {
        slide.classList.toggle('is-active', i === index);
      });
      // Update context panel
      if (projects[index]) renderContext(projects[index]);
      // Play active video, pause others
      slides.forEach(function(slide, i) {
        const v = slide.querySelector('video');
        if (!v) return;
        if (i === index) {
          const p = v.play();
          if (p && typeof p.catch === 'function') p.catch(function() {});
        } else if (!v.paused) {
          v.pause();
        }
      });
    }

    let currentIndex = -1;

    // Use IntersectionObserver to find which project's center is closest
    // to the viewport center. The one with the highest intersectionRatio
    // wins.
    const projectObserver = new IntersectionObserver(function(entries) {
      // Find the project with the highest intersection ratio
      let best = null;
      let bestRatio = 0;
      entries.forEach(function(entry) {
        if (entry.intersectionRatio > bestRatio) {
          best = entry.target;
          bestRatio = entry.intersectionRatio;
        }
      });
      if (best) {
        const idx = Array.prototype.indexOf.call(projects, best);
        if (idx !== -1 && idx !== currentIndex) {
          currentIndex = idx;
          setActive(idx);
        }
      }
    }, {
      // Multiple thresholds so we can distinguish "barely in" vs "mostly in"
      threshold: [0.15, 0.3, 0.5, 0.75, 1.0]
    });

    projects.forEach(function(p) { projectObserver.observe(p); });

    // Show/hide both stage layers when entering/leaving the immersive section
    const workObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        bgStage.classList.toggle('is-visible', entry.isIntersecting);
        ctxStage.classList.toggle('is-visible', entry.isIntersecting);
        // Pause all videos when leaving the section
        if (!entry.isIntersecting) {
          videos.forEach(function(v) { if (!v.paused) v.pause(); });
        }
      });
    }, { threshold: 0 });

    workObserver.observe(work);

    // Initial render: show first project's context + start its video
    setActive(0);
    currentIndex = 0;
  }

  /* ============================================
     MOBILE MENU - FULLSCREEN OVERLAY
     ============================================ */
  function initMobileMenu() {
    const menuToggle = document.getElementById('mobile-menu-toggle');
    const menuOverlay = document.getElementById('mobile-menu-overlay');
    const menuClose = document.getElementById('mobile-menu-close');
    const menuLinks = document.querySelectorAll('.mobile-menu-link');
    
    if (!menuToggle || !menuOverlay) return;
    
    // Open menu
    menuToggle.addEventListener('click', function() {
      menuToggle.classList.add('active');
      menuOverlay.classList.add('active');
      document.body.classList.add('menu-open');
    });
    
    // Close menu - close button
    if (menuClose) {
      menuClose.addEventListener('click', closeMenu);
    }
    
    // Close menu - clicking on a link
    menuLinks.forEach(function(link) {
      link.addEventListener('click', closeMenu);
    });
    
    // Close menu - pressing Escape
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && menuOverlay.classList.contains('active')) {
        closeMenu();
      }
    });
    
    function closeMenu() {
      menuToggle.classList.remove('active');
      menuOverlay.classList.remove('active');
      document.body.classList.remove('menu-open');
    }
  }

  /* ============================================
     PAGE LOADER - STAGGERED LETTER FADE
     ============================================ */
  function initPageLoader() {
    const loader = document.querySelector('.page-loader');
    const chars = document.querySelectorAll('.loader-char');

    // Dot-portrait intro path: the letter loader plays FIRST, then
    // dispatches `loader:done`. dot-bust.js listens for that event and
    // starts the dot assemble animation, which (when 75% complete)
    // fires `dot-bust:assembled` and triggers the hero reveal. So the
    // full intro sequence becomes:
    //   1. letter loader visible
    //   2. letters fade out, loader → .loaded
    //   3. `loader:done` fires → dots begin assembling
    //   4. `dot-bust:assembled` fires → hero text + nav blur-to-focus
    if (hasDotIntro) {
      // Wire the hero animation to fire when the dots have assembled
      // (handled by the inline reveal script in index.html as well —
      // this is a belt-and-braces hook in case animations.js loads
      // before the inline script's listener is attached).
      window.addEventListener('dot-bust:assembled', function () {
        try { triggerHeroAnimation(); } catch (e) { /* no-op */ }
      });

      if (chars.length > 0) {
        // Stagger fade in each letter.
        chars.forEach(function (char, index) {
          setTimeout(function () { char.classList.add('visible'); }, 150 + (index * 120));
        });

        const totalFadeInTime = 150 + (chars.length * 120) + 600;

        setTimeout(function () {
          // Fade out letters in reverse with stagger.
          chars.forEach(function (char, index) {
            setTimeout(function () { char.classList.add('fade-out'); }, index * 60);
          });

          // Once the letters have started leaving, mark the loader as
          // .loaded (kicks off the overlay's fade) AND tell dot-bust
          // it can begin assembling. Syncing the two so the dots fade
          // in as the loader fades out makes the handoff seamless.
          // We set `window.__sohajLoaderDone = true` BEFORE dispatching
          // so dot-bust.js (whose listener might not yet be attached
          // if buildAndRun is still awaiting GLB parse) can poll the
          // flag inside its own setup and not miss the cue.
          setTimeout(function () {
            if (loader) loader.classList.add('loaded');
            window.__sohajLoaderDone = true;
            try {
              window.dispatchEvent(new CustomEvent('loader:done'));
            } catch (e) { /* no-op */ }
          }, (chars.length * 60) + 200);
        }, totalFadeInTime);
      } else if (loader) {
        // No chars to animate — fade the loader out quickly so dots
        // can take over.
        setTimeout(function () {
          loader.classList.add('loaded');
          window.__sohajLoaderDone = true;
          try {
            window.dispatchEvent(new CustomEvent('loader:done'));
          } catch (e) { /* no-op */ }
        }, 400);
      } else {
        // No loader element at all — dispatch immediately so dot-bust
        // doesn't sit forever waiting on `loader:done`.
        window.__sohajLoaderDone = true;
        try {
          window.dispatchEvent(new CustomEvent('loader:done'));
        } catch (e) { /* no-op */ }
      }
      return;
    }

    if (chars.length > 0) {
      // Stagger fade in each letter
      chars.forEach(function(char, index) {
        setTimeout(function() {
          char.classList.add('visible');
        }, 150 + (index * 120)); // Start after 150ms, 120ms between each
      });
      
      // After all letters are visible, hold, then fade out
      const totalFadeInTime = 150 + (chars.length * 120) + 600; // Extra 600ms hold time
      
      setTimeout(function() {
        // Fade out letters in reverse with stagger
        chars.forEach(function(char, index) {
          setTimeout(function() {
            char.classList.add('fade-out');
          }, index * 60);
        });
        
        // Hide loader after fade out completes
        setTimeout(function() {
          if (loader) {
            loader.classList.add('loaded');
          }
          triggerHeroAnimation();
        }, (chars.length * 60) + 400);
        
      }, totalFadeInTime);
      
    } else {
      // Fallback if no loader chars
      window.addEventListener('load', function() {
        setTimeout(function() {
          if (loader) {
            loader.classList.add('loaded');
          }
          triggerHeroAnimation();
        }, 400);
      });
    }
  }

  function triggerHeroAnimation() {
    if (heroAnimationTriggered) return;
    heroAnimationTriggered = true;
    const heroElements = document.querySelectorAll('header .reveal');
    heroElements.forEach(function(el, i) {
      setTimeout(function() {
        el.classList.add('active');
      }, i * 120);
    });
  }
  // Surface to the inline intro-reveal script in index.html so it can
  // trigger the hero `.reveal` cascade once dot-bust:assembled fires.
  window.triggerHeroAnimation = triggerHeroAnimation;

  /* ============================================
     PORTRAIT SCROLL ANIMATION
     Switches between expression states on scroll
     ============================================ */
  function initPortraitScrollAnimation() {
    const state1 = document.querySelector('.portrait-state1');
    const state2 = document.querySelector('.portrait-state2');
    const state3 = document.querySelector('.portrait-state3');
    
    if (!state1 || !state2) return;
    
    // Scroll thresholds - switch at these scroll positions (in pixels)
    const threshold1 = 50;   // Switch to state 2
    const threshold2 = 100;  // Switch to state 3
    let currentState = 1;
    let ticking = false;
    
    function setActiveState(newState) {
      if (currentState === newState) return;
      
      // Remove active from all states
      state1.classList.remove('active');
      state2.classList.remove('active');
      if (state3) state3.classList.remove('active');
      
      // Add active to the new state
      if (newState === 1) {
        state1.classList.add('active');
      } else if (newState === 2) {
        state2.classList.add('active');
      } else if (newState === 3 && state3) {
        state3.classList.add('active');
      }
      
      currentState = newState;
    }
    
    window.addEventListener('scroll', function() {
      if (!ticking) {
        window.requestAnimationFrame(function() {
          const scrollY = window.scrollY;
          
          // Determine which state based on scroll position
          if (state3 && scrollY > threshold2) {
            setActiveState(3);
          } else if (scrollY > threshold1) {
            setActiveState(2);
          } else {
            setActiveState(1);
          }
          
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  /* ============================================
     SCROLL REVEAL - Enhanced with multiple effects
     ============================================ */
  function initScrollReveal() {
    // Basic reveal elements
    const revealElements = document.querySelectorAll('.reveal');
    
    const observerOptions = {
      root: null,
      rootMargin: '0px 0px -80px 0px',
      threshold: 0.1
    };

    const observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    revealElements.forEach(function(el) {
      if (!el.closest('header')) {
        observer.observe(el);
      }
    });
    
    // Fallback: Make blog items visible immediately to ensure clickability
    setTimeout(function() {
      document.querySelectorAll('#blog .reveal').forEach(function(el) {
        el.classList.add('active');
      });
    }, 500);

    // Fade-in-up for sections
    const sections = document.querySelectorAll('section');
    sections.forEach(function(section) {
      section.classList.add('section-animate');
    });

    const sectionObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('section-visible');
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -50px 0px' });

    sections.forEach(function(section) {
      sectionObserver.observe(section);
    });
  }

  /* ============================================
     CARD ANIMATIONS - Staggered reveal
     ============================================ */
  function initCardAnimations() {
    // Only apply to portfolio-item elements within sections
    const portfolioItems = document.querySelectorAll('section .portfolio-item');
    
    const cardObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('card-visible');
          cardObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05, rootMargin: '50px 0px 0px 0px' });

    portfolioItems.forEach(function(item, index) {
      item.classList.add('card-animate');
      // Add staggered delay based on position in row
      item.style.transitionDelay = (index % 3) * 0.1 + 's';
      cardObserver.observe(item);
    });

    // Safety fallback - ensure all cards are visible after 2 seconds
    setTimeout(function() {
      portfolioItems.forEach(function(item) {
        item.classList.add('card-visible');
      });
      document.querySelectorAll('.section-animate').forEach(function(section) {
        section.classList.add('section-visible');
      });
    }, 2000);
  }

  /* ============================================
     PARALLAX - Placeholder for future use
     ============================================ */
  function initParallax() {
    // Parallax effects can be added here if needed
  }

  /* ============================================
     SCROLL PROGRESS - Visual indicator
     ============================================ */
  function initScrollProgress() {
    // Create progress bar
    const progressBar = document.createElement('div');
    progressBar.className = 'scroll-progress';
    document.body.appendChild(progressBar);

    let ticking = false;

    window.addEventListener('scroll', function() {
      if (!ticking) {
        window.requestAnimationFrame(function() {
          const scrollTop = window.pageYOffset;
          const docHeight = document.documentElement.scrollHeight - window.innerHeight;
          const scrollPercent = (scrollTop / docHeight) * 100;
          progressBar.style.width = scrollPercent + '%';
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  /* ============================================
     NAVBAR SCROLL
     ============================================ */
  function initNavbarScroll() {
    const navbar = document.querySelector('.navbar-fixed-top');
    if (!navbar) return;

    let ticking = false;
    let lastScrollY = 0;

    window.addEventListener('scroll', function() {
      if (!ticking) {
        window.requestAnimationFrame(function() {
          const currentScrollY = window.scrollY;
          
          if (currentScrollY > 80) {
            navbar.classList.add('navbar-shrink');
          } else {
            navbar.classList.remove('navbar-shrink');
          }

          // Hide/show navbar on scroll direction
          if (currentScrollY > lastScrollY && currentScrollY > 400) {
            navbar.classList.add('navbar-hidden');
          } else {
            navbar.classList.remove('navbar-hidden');
          }
          
          lastScrollY = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  /* ============================================
     SMOOTH SCROLL
     ============================================ */
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
      anchor.addEventListener('click', function(e) {
        const targetId = this.getAttribute('href');
        
        if (targetId === '#' || targetId === '#page-top') {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        
        const target = document.querySelector(targetId);
        if (target) {
          e.preventDefault();
          const navbar = document.querySelector('.navbar-fixed-top');
          const offset = navbar ? navbar.offsetHeight + 20 : 20;
          const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;
          
          window.scrollTo({ top: targetPosition, behavior: 'smooth' });
        }
      });
    });
  }

  // ============================================
  // SCROLL REVEAL ANIMATIONS
  // Inspired by Timeless (https://timeless.framer.media/)
  // ============================================
  
  function initScrollReveal() {
    // Select all elements with reveal classes
    const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
    
    if (revealElements.length === 0) return;
    
    // Create Intersection Observer
    const observerOptions = {
      root: null,
      rootMargin: '0px 0px -50px 0px', // Trigger slightly before element is fully visible
      threshold: 0.1
    };
    
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          
          // Add stagger delay if element has stagger class
          const staggerClasses = el.className.match(/stagger-(\d+)/);
          if (staggerClasses) {
            const delay = parseInt(staggerClasses[1]) * 100;
            el.style.transitionDelay = `${delay}ms`;
          }
          
          // Trigger the reveal animation
          el.classList.add('revealed');
          
          // Stop observing once revealed
          observer.unobserve(el);
        }
      });
    }, observerOptions);
    
    // Observe all reveal elements
    revealElements.forEach(el => {
      revealObserver.observe(el);
    });
  }

  // ============================================
  // COUNTER ANIMATION
  // ============================================
  
  function initCounterAnimation() {
    const counters = document.querySelectorAll('.counter');
    if (counters.length === 0) return;
    
    let animated = false;
    
    // Smooth continuous animation for $1B impact
    // Note: The "$" is in the HTML outside the span, so we don't add it here
    const animateBillionCounter = (counter) => {
      const duration = 2500; // 2.5 seconds total
      const targetValue = 1000; // Target is 1000M = 1B
      const startTime = performance.now();
      
      const updateCounter = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function - ease out cubic for smooth deceleration
        const easeOutCubic = 1 - Math.pow(1 - progress, 3);
        
        // Calculate current value (0 to 1000 million)
        const currentValue = Math.floor(easeOutCubic * targetValue);
        
        // Format the display (no $ prefix - it's in the HTML)
        if (currentValue >= 1000) {
          counter.textContent = '1B';
        } else if (currentValue >= 100) {
          counter.textContent = currentValue + 'M';
        } else {
          counter.textContent = currentValue + 'M';
        }
        
        if (progress < 1) {
          requestAnimationFrame(updateCounter);
        } else {
          counter.textContent = '1B';
        }
      };
      
      requestAnimationFrame(updateCounter);
    };
    
    const animateCounters = () => {
      if (animated) return;
      
      counters.forEach(counter => {
        const target = parseInt(counter.getAttribute('data-target'));
        const suffix = counter.getAttribute('data-suffix') || '';
        
        // Check if this is the $1B counter (target=1, suffix=B)
        if (target === 1 && suffix === 'B') {
          animateBillionCounter(counter);
          return;
        }
        
        // Standard counter animation for other stats
        const duration = 2000; // 2 seconds
        const startTime = performance.now();
        
        const updateCounter = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          
          // Easing function for smooth animation
          const easeOutQuart = 1 - Math.pow(1 - progress, 4);
          const current = Math.floor(easeOutQuart * target);
          
          counter.textContent = current + suffix;
          
          if (progress < 1) {
            requestAnimationFrame(updateCounter);
          } else {
            counter.textContent = target + suffix;
          }
        };
        
        requestAnimationFrame(updateCounter);
      });
      
      animated = true;
    };
    
    // Intersection Observer to trigger animation when section is visible
    const statsSection = document.getElementById('stats-section');
    if (!statsSection) return;
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !animated) {
          animateCounters();
        }
      });
    }, {
      threshold: 0.3 // Trigger when 30% of the section is visible
    });
    
    observer.observe(statsSection);
  }
  
  // Initialize counter animation
  initCounterAnimation();

  /* ============================================
     ACHIEVEMENTS PARALLAX SECTION
     ============================================ */
  function initAchievementsParallax() {
    const achievementBlocks = document.querySelectorAll('.achievement-block');
    
    if (achievementBlocks.length === 0) return;
    
    // Track which blocks have been animated
    const animatedBlocks = new Set();
    
    // Animate achievement number based on block type
    function animateAchievementNumber(block) {
      const numberEl = block.querySelector('.achievement-number');
      if (!numberEl) return;
      
      const achievementType = block.getAttribute('data-achievement');
      const duration = 2000;
      const startTime = performance.now();
      
      if (achievementType === 'revenue') {
        // Animate $500M+ (smooth from $0M to $500M+)
        const targetValue = 500;
        const animate = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const easeOut = 1 - Math.pow(1 - progress, 3);
          const currentValue = Math.floor(easeOut * targetValue);
          
          if (currentValue >= targetValue) {
            numberEl.textContent = '$500M+';
          } else {
            numberEl.textContent = '$' + currentValue + 'M';
          }
          
          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            numberEl.textContent = '$500M+';
          }
        };
        requestAnimationFrame(animate);
        
      } else if (achievementType === 'mentoring') {
        // Animate 200+
        const targetValue = 200;
        const animate = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const easeOut = 1 - Math.pow(1 - progress, 4);
          const currentValue = Math.floor(easeOut * targetValue);
          
          numberEl.textContent = currentValue + '+';
          
          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            numberEl.textContent = '200+';
          }
        };
        requestAnimationFrame(animate);
        
      }
      // 'awards' shows static "7" - no animation needed
      // 'publications' has "Featured" text - no animation needed
    }
    
    // Intersection Observer for triggering animations when blocks come into view
    const blockObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          
          // Animate the number if not already animated
          const blockId = entry.target.getAttribute('data-achievement');
          if (!animatedBlocks.has(blockId)) {
            animatedBlocks.add(blockId);
            animateAchievementNumber(entry.target);
          }
        } else {
          // Optionally remove class when out of view for re-animation
          // entry.target.classList.remove('in-view');
        }
      });
    }, {
      threshold: 0.3, // Trigger when 30% of block is visible
      rootMargin: '-10% 0px -10% 0px'
    });
    
    achievementBlocks.forEach(block => {
      blockObserver.observe(block);
    });
    
    // Scroll spread animation removed - floating items stay in fixed positions
  }
  
  // Initialize achievements parallax
  initAchievementsParallax();

  /* ============================================
     INTRO REVEAL — scroll-driven word fade-in
     Splits the intro paragraph into per-word spans
     and brightens them as the section scrolls past.
     ============================================ */
  function initIntroReveal() {
    var section = document.getElementById('introReveal');
    if (!section) return;
    var el = section.querySelector('[data-intro-reveal]');
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // CSS already lights up every word for reduced-motion users.
      return;
    }

    // Split the paragraph text into <span class="intro-word"> per token,
    // preserving whitespace as text nodes so layout flows naturally.
    var rawText = el.textContent.trim();
    el.innerHTML = '';
    var words = [];
    rawText.split(/(\s+)/).forEach(function (token) {
      if (!token) return;
      if (/^\s+$/.test(token)) {
        el.appendChild(document.createTextNode(' '));
      } else {
        var span = document.createElement('span');
        span.className = 'intro-word';
        span.textContent = token;
        el.appendChild(span);
        words.push(span);
      }
    });
    if (!words.length) return;

    var total = words.length;
    var lastActive = -1;
    var ticking = false;
    var inView = false;

    function update() {
      ticking = false;
      var rect = section.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;

      // Map scroll progress through the section to [0..1].
      // Start: section top crosses 50% of viewport (mid-screen).
      // End:   section bottom crosses 10% of viewport (almost past).
      var startY = vh * 0.50;
      var endY = vh * 0.10;
      var span = startY - endY;
      var progress = (startY - rect.top) / span;
      if (progress < 0) progress = 0;
      if (progress > 1) progress = 1;

      // Slight ease-out so the last words don't lag visually.
      var eased = 1 - Math.pow(1 - progress, 1.4);

      // Number of words that should be active at this scroll position.
      // We scale to total so the very last word lights only at full progress.
      var activeCount = Math.round(eased * total);
      if (activeCount === lastActive) return;

      if (activeCount > lastActive) {
        for (var i = Math.max(0, lastActive); i < activeCount && i < total; i++) {
          words[i].classList.add('active');
        }
      } else {
        for (var j = lastActive - 1; j >= activeCount && j >= 0; j--) {
          if (words[j]) words[j].classList.remove('active');
        }
      }
      lastActive = activeCount;
    }

    function onScroll() {
      if (!inView || ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    // Only listen for scroll while the section is anywhere near the viewport.
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          inView = entry.isIntersecting;
          if (inView) {
            requestAnimationFrame(update);
          }
        });
      }, { rootMargin: '50% 0px 50% 0px', threshold: 0 });
      io.observe(section);
    } else {
      inView = true;
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    // Run once on init so the correct initial state is set if the page
    // loads with the section already partly in view.
    requestAnimationFrame(update);
  }

  /* ============================================
     CUSTOM CURSOR (sikhAI-style)
     Smooth-trailing dot that grows on interactives
     ============================================ */
  function initCustomCursor() {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // The cursor dot is now rendered as a CSS `body::before` pseudo-element
    // driven by CSS custom properties (--cdx / --cdy set in the rAF loop).
    // Pseudo-elements are invisible to DevTools element-picker and to
    // document.elementFromPoint(), so they can never block element inspection
    // or intercept real click events — unlike a real DOM div at z-index 9998.
    // Remove any legacy DOM cursor-dot that may exist from a prior render.
    var legacyDot = document.getElementById('cursorDot');
    if (legacyDot) legacyDot.remove();

    var mx = 0, my = 0, dx = 0, dy = 0;
    var body = document.body;

    document.addEventListener('mousemove', function (e) {
      mx = e.clientX;
      my = e.clientY;
      body.classList.add('cursor-visible');
    }, { passive: true });

    document.addEventListener('mouseleave', function () {
      body.classList.remove('cursor-visible');
    });

    document.addEventListener('mouseenter', function () {
      body.classList.add('cursor-visible');
    });

    document.addEventListener('mousedown', function () {
      body.classList.add('cursor-click');
    });
    document.addEventListener('mouseup', function () {
      body.classList.remove('cursor-click');
    });

    function loop() {
      dx += (mx - dx) * 0.18;
      dy += (my - dy) * 0.18;
      body.style.setProperty('--cdx', dx + 'px');
      body.style.setProperty('--cdy', dy + 'px');
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    var hoverSelector = [
      'a', 'button', 'input[type="submit"]', 'input[type="button"]',
      '.btn', '.btn-primary', '.btn-secondary',
      '.portfolio-item', '.portfolio-link',
      '.work-card', '.project-card', '.feature-card',
      '.modal-trigger', '.video-trigger', '.video-modal-trigger',
      '[role="button"]', '[data-toggle]', 'label', 'select', 'summary'
    ].join(',');

    function bindHover(el) {
      el.addEventListener('mouseenter', function () { body.classList.add('cursor-hover'); });
      el.addEventListener('mouseleave', function () { body.classList.remove('cursor-hover'); });
    }

    document.querySelectorAll(hoverSelector).forEach(bindHover);

    // Re-scan when DOM changes (e.g. dynamically loaded portfolio cards, chat widget)
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes && m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (node.matches && node.matches(hoverSelector)) bindHover(node);
          if (node.querySelectorAll) {
            node.querySelectorAll(hoverSelector).forEach(bindHover);
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomCursor);
  } else {
    initCustomCursor();
  }

})();
