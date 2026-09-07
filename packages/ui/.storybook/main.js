/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  addons: ["@storybook/addon-docs", "@storybook/addon-onboarding", "@storybook/addon-vitest"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (config) => ({
    ...config,
    optimizeDeps: {
      ...config.optimizeDeps,
      include: [
        ...(config.optimizeDeps?.include ?? []),
        "three",
        "three/addons/loaders/GLTFLoader.js",
        "three/addons/environments/RoomEnvironment.js",
      ],
    },
  }),
  staticDirs: ["../assets"],
  stories: ["../components/**/*.mdx", "../components/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
};
export default config;
