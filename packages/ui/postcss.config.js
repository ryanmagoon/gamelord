const path = require('node:path')
const tailwind = require('@tailwindcss/postcss')

module.exports = {
  plugins: [
    tailwind({
      sources: [
        {
          base: path.resolve(__dirname, 'components'),
          pattern: '**/*.{js,ts,jsx,tsx}',
          negated: false,
        },
        {
          base: path.resolve(__dirname),
          pattern: 'utils.ts',
          negated: false,
        },
      ],
    }),
  ],
}
