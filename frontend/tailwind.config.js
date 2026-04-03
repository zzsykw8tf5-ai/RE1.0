/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        apple: {
          blue: '#0066CC',
          'blue-hover': '#0055A5',
          gray: '#F5F5F7',
          'gray-2': '#E8E8ED',
          'gray-3': '#D2D2D7',
          'text': '#1D1D1F',
          'text-secondary': '#6E6E73',
          'text-tertiary': '#AEAEB2',
          'green': '#34C759',
          'orange': '#FF9500',
          'red': '#FF3B30',
          'purple': '#AF52DE',
          'teal': '#30B0C7',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        'apple': '12px',
        'apple-lg': '18px',
        'apple-xl': '24px',
      },
      boxShadow: {
        'apple': '0 2px 20px rgba(0,0,0,0.08)',
        'apple-md': '0 4px 30px rgba(0,0,0,0.12)',
        'apple-lg': '0 8px 40px rgba(0,0,0,0.16)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
