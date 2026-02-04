/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  stories: [
    '../components/**/*.mdx',
    '../components/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  staticDirs: ['../assets'],
  addons: ['@storybook/addon-docs', '@storybook/addon-onboarding'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  async viteFinal(config) {
    const { default: tailwindcss } = await import('@tailwindcss/vite')
    return {
      ...config,
      plugins: [...(config.plugins || []), tailwindcss()],
    }
  },
}
export default config
