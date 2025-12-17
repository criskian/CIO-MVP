import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        almia: {
          'purple-dark': '#66398E',
          'purple': '#835EA4',
          'purple-light': '#BEA9CF',
          'coral': '#F1907C',
          'red': '#ED6B50',
          'teal': '#6BC2BE',
        },
        admin: {
          'bg-primary': '#ffffff',
          'bg-secondary': '#f8f7fc',
          'bg-sidebar': '#66398E',
          'text-primary': '#1f2937',
          'text-secondary': '#6b7280',
        },
      },
    },
  },
  plugins: [],
};

export default config;

