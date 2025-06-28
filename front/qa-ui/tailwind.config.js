// tailwind.config.js
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      typography: {
        DEFAULT: {
          css: {
            '--tw-prose-body': 'rgb(51 65 85)', // text-slate-800
            '--tw-prose-headings': 'rgb(51 65 85)',
            '--tw-prose-lead': 'rgb(51 65 85)',
            '--tw-prose-links': 'rgb(37 99 235)', // blue-600
            '--tw-prose-bold': 'rgb(51 65 85)',
            '--tw-prose-counters': 'rgb(100 116 139)', // slate-500
            '--tw-prose-bullets': 'rgb(100 116 139)', // slate-500
            '--tw-prose-hr': 'rgb(226 232 240)', // slate-200
            '--tw-prose-quotes': 'rgb(51 65 85)',
            '--tw-prose-quote-borders': 'rgb(226 232 240)',
            '--tw-prose-captions': 'rgb(100 116 139)',
            '--tw-prose-code': 'rgb(51 65 85)',
            '--tw-prose-pre-code': 'rgb(51 65 85)',
            '--tw-prose-pre-bg': 'rgb(255 255 255)', // white
            '--tw-prose-th-borders': 'rgb(226 232 240)',
            '--tw-prose-td-borders': 'rgb(226 232 240)',

            pre: {
              'white-space': 'pre-wrap',
              'word-break': 'break-all',
              'overflow-wrap': 'break-word',
              'max-width': '100%',
            },
            code: {
              'word-break': 'break-all',
              'overflow-wrap': 'break-word',
            },
          },
        },
        invert: {
          css: {
            '--tw-prose-body': '#fff',           // Pure white text
            '--tw-prose-headings': '#fff',
            '--tw-prose-lead': '#fff',
            '--tw-prose-links': '#93c5fd',      // blue-300 (optional)
            '--tw-prose-bold': '#fff',
            '--tw-prose-counters': '#fff',
            '--tw-prose-bullets': '#fff',
            '--tw-prose-hr': '#fff',
            '--tw-prose-quotes': '#fff',
            '--tw-prose-quote-borders': '#fff',
            '--tw-prose-captions': '#fff',
            '--tw-prose-code': '#fde047',       // yellow-300 for inline code
            '--tw-prose-pre-code': '#fff',      // code in block: white
            '--tw-prose-pre-bg': '#1e293b',     // slate-800 for code block background
            '--tw-prose-th-borders': '#fff',
            '--tw-prose-td-borders': '#fff',

            pre: {
              'white-space': 'pre-wrap',
              'word-break': 'break-all',
              'overflow-wrap': 'break-word',
              'max-width': '100%',
            },
            code: {
              'word-break': 'break-all',
              'overflow-wrap': 'break-word',
            },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};