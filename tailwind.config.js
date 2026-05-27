/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#FF6B35',
          orangeHover: '#E65A28',
          orangeShadow: '#C84B1E',
          purple: '#7B5EA7',
          purpleLight: '#F0ECFF',
          purpleBorder: '#D8CEFC',
          green: '#4CAF50',
          greenLight: '#E8F8EC',
          greenBorder: '#BDEAC5',
          greenDark: '#2E7D32',
          blue: '#2196F3',
          blueLight: '#E8F4FF',
          blueBorder: '#BDD9F5',
          blueDark: '#1565C0',
          amber: '#FFB347',
          amberLight: '#FFF8F0',
          amberBorder: '#FFD5C0',
          yellowLight: '#FFF8E1',
          yellowDark: '#F57F17',
          yellowBorder: '#FFE082',
        },
      },
      fontFamily: {
        nunito: ['Nunito', 'sans-serif'],
        poppins: ['Poppins', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
