document.addEventListener('DOMContentLoaded', function(){
		// Portrait state elements
		var state1 = document.querySelector('.portrait-state1');
		var stateImpact = document.querySelector('.portrait-state-impact'); // "I design for impact" - money.mp4
		var stateSimple = document.querySelector('.portrait-state-simple'); // "I simplify complexity"
		var state2 = document.querySelector('.portrait-state2'); // This is now a video - "I help teams grow"
		var state3 = document.querySelector('.portrait-state3');
		
		// Track current state for determining transition speed
		var currentState = 'state1';
		
		// Function to set active portrait state
		// useSlowFade: 2s transition for state1 ↔ simple
		// useMediumFade: 1s transition for simple → state1 reverse
		function setPortraitState(stateName, useSlowFade, useMediumFade) {
			// Remove active from all states
			if (state1) state1.classList.remove('active');
			if (stateImpact) {
				stateImpact.classList.remove('active');
				if (stateImpact.tagName === 'VIDEO') {
					stateImpact.pause();
					stateImpact.currentTime = 0;
				}
			}
			if (stateSimple) stateSimple.classList.remove('active');
			if (state2) {
				state2.classList.remove('active');
				// Pause and reset video when not active
				if (state2.tagName === 'VIDEO') {
					state2.pause();
					state2.currentTime = 0;
				}
			}
			if (state3) state3.classList.remove('active');
			
			// Remove fade classes from all states first
			if (state1) {
				state1.classList.remove('slow-fade');
				state1.classList.remove('medium-fade');
			}
			if (stateSimple) {
				stateSimple.classList.remove('slow-fade');
				stateSimple.classList.remove('medium-fade');
			}
			
			// Apply appropriate fade class
			if (useSlowFade) {
				if (state1) state1.classList.add('slow-fade');
				if (stateSimple) stateSimple.classList.add('slow-fade');
			} else if (useMediumFade) {
				if (state1) state1.classList.add('medium-fade');
				if (stateSimple) stateSimple.classList.add('medium-fade');
			}
			
			// Activate the requested state
			if (stateName === 'state1' && state1) {
				state1.classList.add('active');
			} else if (stateName === 'impact' && stateImpact) {
				stateImpact.classList.add('active');
				// Play video when impact state is active
				if (stateImpact.tagName === 'VIDEO') {
					stateImpact.currentTime = 0;
					stateImpact.play();
				}
			} else if (stateName === 'simple' && stateSimple) {
				stateSimple.classList.add('active');
			} else if (stateName === 'grow' && state2) {
				state2.classList.add('active');
				// Play video when grow state is active
				if (state2.tagName === 'VIDEO') {
					state2.currentTime = 0;
					state2.play();
				}
			} else if (stateName === 'state3' && state3) {
				state3.classList.add('active');
			}
			
			// Update current state
			currentState = stateName;
		}
		
		// Variable to store timeout for reverse animation
		var reverseTimeout = null;
		
		Typed.new('#typed', {
			stringsElement: document.getElementById('typed-strings'),
			backDelay: 2500,
			loop: true,
			// Callback BEFORE each string starts typing
			preStringTyped: function(arrayPos) {
				// Clear any pending reverse animation
				if (reverseTimeout) {
					clearTimeout(reverseTimeout);
					reverseTimeout = null;
				}
				
				// Change portrait based on which string is about to be typed
				// String 0: "Hi! I'm Sohaj." → state1
				// String 1: "I help teams grow." → grow.mp4 (video)
				// String 2: "I design for impact." → money.mp4 (video)
				// String 3: "I simplify complexity." → simple.jpg → then back to state1
				if (arrayPos === 1) {
					setPortraitState('grow', false, false); // "I help teams grow" → play video
				} else if (arrayPos === 2) {
					setPortraitState('impact', false, false); // "I design for impact" → play money.mp4
				} else if (arrayPos === 3) {
					// Show simple.jpg immediately when "I simplify complexity" starts (2s fade in)
					setPortraitState('simple', true, false);
					// After 3s (simple.jpg visible for 1 extra second), fade back to state1 in 1s
					reverseTimeout = setTimeout(function() {
						setPortraitState('state1', false, true); // Medium fade back (1s)
					}, 3000);
				} else {
					setPortraitState('state1', false, false); // Default → state1 (fast transition)
				}
			}
		});
	});
