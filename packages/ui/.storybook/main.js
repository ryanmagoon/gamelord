import path from 'node:path'

/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  stories: [
    '../components/**/*.mdx',
    '../components/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  addons: ['@storybook/addon-docs', '@storybook/addon-onboarding'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  async viteFinal(config) {
    return {
      ...config,
      css: {
        postcss: {
          config: path.resolve(__dirname, '../postcss.config.js'),
        },
      },
    }
  },
}
export default config
