import React from 'react';
import { Agentation } from 'agentation';
import '../index.css';
// index.css imports tailwindcss and theme for Storybook

/** @type { import('@storybook/react-vite').Preview } */
const preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
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
