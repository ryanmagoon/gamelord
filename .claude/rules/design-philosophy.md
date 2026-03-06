# Design Philosophy

- **Extremely polished UI.** Every interaction should feel intentional and delightful. Prioritize craft and attention to detail — this is a desktop app, not a throwaway prototype.
- **Microinteractions and animations.** Use tasteful transitions, hover effects, loading states, and motion to make the app feel alive. Think about easing curves, staggered animations, and subtle feedback on every click, toggle, and navigation.
- **Ideate novel flourishes.** When implementing a feature, proactively suggest creative UI touches — e.g. a CRT power-on animation when launching a game, particle effects on achievements, satisfying haptic-style feedback on button presses, ambient glow effects. Propose these ideas to the user before implementing.
- **No content may appear without a transition.** Every element that enters the DOM asynchronously (after initial paint) must have an entrance animation — opacity fade, slide, scale, or stagger. Abrupt pop-in is a bug, not a feature. This applies to data-driven content after fetch, filter/sort results, notifications, and any conditional UI.
