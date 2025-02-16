import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en_US from './en_US.json'
import zh_CN from './zh_CN.json'

export const defaultLng = 'en_US';
export const defaultNS = 'translations';
// this is exported in order to avoid hard coding supported languages in more than 1 place
export const resources = {
	en_US: {
		[defaultNS]: en_US
	},
	zh_CN: {
		[defaultNS]: zh_CN
	}
}

i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		resources,
		fallbackLng: defaultLng,
		debug: false,
		ns: [defaultNS],
		defaultNS: defaultNS,
		// by default ".". "if working with a flat JSON, it's recommended to set this to false"
		keySeparator: false,
		interpolation: {
			escapeValue: false
		}
	});

export default i18n;
