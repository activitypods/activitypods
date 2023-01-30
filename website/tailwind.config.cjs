const defaultTheme = require('tailwindcss/defaultTheme');
const colors = require('tailwindcss/colors');

module.exports = {
	content: ['./src/**/*.{astro,html,js,jsx,md,svelte,ts,tsx,vue}'],
	theme: {
		extend: {
			colors: {
				black: '#353535',
				primary: {
					50: "#F4F0FF",
					100: "#E5DBFF",
					200: "#CBB8FF",
					300: "#B094FF",
					400: "#9670FF",
					500: "#7C4DFF",
					600: "#4B0AFF",
					700: "#3500C7",
					800: "#230085",
					900: "#120042"
				},
				secondary: {
					50: "#FFE5F3",
					100: "#FFC7E4",
					200: "#FF94CB",
					300: "#FF5CB0",
					400: "#FF2997",
					500: "#F1007E",
					600: "#C20064",
					700: "#8F004A",
					800: "#610032",
					900: "#2E0018"
				},
				tertiary: {
					50: "#EBEBEB",
					100: "#D6D6D6",
					200: "#ADADAD",
					300: "#858585",
					400: "#5E5E5E",
					500: "#353535",
					600: "#2B2B2B",
					700: "#1F1F1F",
					800: "#141414",
					900: "#0A0A0A"
				}
			},
			fontFamily: {
				sans: ["'PT Sans'", ...defaultTheme.fontFamily.sans],
			},
		},
	},
	plugins: [require('@tailwindcss/typography')],
	darkMode: 'class',
};

/* 

  Alternative tailwind.config.js
  
  NOTE: Add this fonts to <head>
    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;700&display=swap" rel="stylesheet" />
*/

// module.exports = {
//   content: ["./src/**/*.{astro,html,js,jsx,md,svelte,ts,tsx,vue}"],
//   theme: {
//     extend: {
//       colors: {
//         primary: colors.cyan,
//         secondary: colors.lime,
//       },
//       fontFamily: {
//         sans: ["'Nunito'", ...defaultTheme.fontFamily.sans],
//       },
//     },
//   },
//   plugins: [require("@tailwindcss/typography")],
//   darkMode: "class",
// };
