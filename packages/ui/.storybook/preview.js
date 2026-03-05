import React from 'react';
import isChromatic from 'chromatic/isChromatic';
import { Agentation } from 'agentation';
import { tvStaticManager } from '../components/TVStaticManager';
import '../index.css';
// index.css imports tailwindcss and theme for Storybook

// In Chromatic's capture environment, make canvas noise deterministic (seeded
// PRNG, single frame) so screenshots are pixel-identical across runs.
if (isChromatic()) {
  tvStaticManager.setDeterministic(true);
}

/** @type { import('@storybook/react-vite').Preview } */
const preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    // Pause all CSS animations at their first frame for Chromatic snapshots.
    chromatic: { pauseAnimationAtEnd: true },
  },
  decorators: [
    (Story) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Story),
        React.createElement(Agentation, {
          endpoint: 'http://localhost:4747',
          copyToClipboard: true,
        }),
      ),
  ],
}

export default preview
