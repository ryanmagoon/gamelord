const path = require('node:path')
const tailwind = require('@tailwindcss/postcss')

module.exports = {
  plugins: [
    tailwind({
      sources: [
        // Desktop app source files
        {
          base: path.resolve(__dirname, 'src'),
          pattern: '**/*.{js,ts,jsx,tsx}',
        },
        // UI package components
        {
          base: path.resolve(__dirname, '../../packages/ui/components'),
          pattern: '**/*.{js,ts,jsx,tsx}',
        },
        {
          base: path.resolve(__dirname, '../../packages/ui'),
          pattern: 'utils.ts',
        },
      ],
    }),
    require('autoprefixer'),
  ],
}
