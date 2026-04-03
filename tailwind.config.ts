import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fef7ee', 100: '#fdedd3', 200: '#f9d7a5', 300: '#f5b96d',
          400: '#f09332', 500: '#ec7a11', 600: '#dd6007', 700: '#b74809',
          800: '#92390e', 900: '#76310f', 950: '#401605',
        },
      },
    },
  },
  plugins: [],
}
export default config
