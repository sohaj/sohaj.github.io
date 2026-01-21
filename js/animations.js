/* ============================================
   ELEGANT ANIMATIONS - Sohaj Singh Brar Portfolio
   Clean, Smooth, Professional
   ============================================ */

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    initPageLoader();
    initNavbarScroll();
    initSmoothScroll();
    initScrollReveal();
    initMobileMenu();
    // Portrait animation now controlled by typed.js in typewriter.js
    // initPortraitScrollAnimation();
  });

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
    const heroElements = document.querySelectorAll('header .reveal');
    heroElements.forEach(function(el, i) {
      setTimeout(function() {
        el.classList.add('active');
      }, i * 120);
    });
  }

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
        // Animate $1B+ (smooth from $0M to $1B+)
        const targetValue = 1000;
        const animate = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const easeOut = 1 - Math.pow(1 - progress, 3);
          const currentValue = Math.floor(easeOut * targetValue);
          
          if (currentValue >= 1000) {
            numberEl.textContent = '$1B+';
          } else {
            numberEl.textContent = '$' + currentValue + 'M';
          }
          
          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            numberEl.textContent = '$1B+';
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

})();
