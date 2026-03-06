const path = require('node:path')
const tailwind = require('@tailwindcss/postcss')

module.exports = {
  plugins: [
    tailwind({
      sources: [
        {
          base: path.resolve(__dirname, 'components'),
          negated: false,
          pattern: '**/*.{js,ts,jsx,tsx}',
        },
        {
          base: path.resolve(__dirname),
          negated: false,
          pattern: 'utils.ts',
        },
      ],
    }),
  ],
}
