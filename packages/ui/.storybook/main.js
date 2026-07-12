/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  addons: ["@storybook/addon-docs", "@storybook/addon-onboarding", "@storybook/addon-vitest"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  staticDirs: ["../assets"],
  stories: ["../components/**/*.mdx", "../components/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
};
export default config;
