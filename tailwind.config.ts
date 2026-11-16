import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          pink: '#E1306C',
          orange: '#F77737',
          purple: '#833AB4',
          blue: '#0095F6',
          blueHover: '#1877F2',
        },
        surface: {
          light: '#FFFFFF',
          lightSecondary: '#FAFAFA',
          dark: '#000000',
          darkElevated: '#121212',
          darkCard: '#1C1C1E',
        },
      },
    },
  },
  plugins: [],
};

export default config;
