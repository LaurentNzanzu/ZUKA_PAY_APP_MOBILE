/**
 * Language catalogue. Offered languages = one primary language per country (see countries.ts).
 * To add a language: append one line here. Nothing else to change —
 * the translation layer translates the interface automatically and caches it.
 * fr, en and sw have hand-written dictionaries; every other language is
 * machine-translated from English and stored in the shared cache.
 */
export type LangInfo = { code: string; name: string; native: string; countries: string; rtl?: boolean | undefined };

const L = (code: string, name: string, native: string, countries: string, rtl?: boolean): LangInfo => ({ code, name, native, countries, rtl });

/** Catalogue of translatable languages (metadata only). Which ones are offered is decided by COUNTRY_LANGUAGE. */
const CATALOG: LangInfo[] = [
  L("fr", "French", "Français", "RDC, France, Belgique, Suisse, Canada, Sénégal, Côte d'Ivoire, Cameroun…"),
  L("en", "English", "English", "UK, USA, Nigeria, Kenya, Ghana, India, South Africa, Australia…"),
  L("sw", "Swahili", "Kiswahili", "Tanzania, Kenya, Uganda, RDC, Rwanda"),
  L("ln", "Lingala", "Lingála", "RDC, Congo"),
  L("kg", "Kikongo", "Kikongo", "RDC, Congo, Angola"),
  L("lu", "Tshiluba", "Tshiluba", "RDC"),
  L("es", "Spanish", "Español", "España, México, Argentina, Colombia, Guinea Ecuatorial…"),
  L("pt", "Portuguese", "Português", "Portugal, Brasil, Angola, Moçambique, Cabo Verde…"),
  L("ar", "Arabic", "العربية", "Égypte, Maroc, Algérie, Arabie saoudite, Tchad, Soudan…", true),
  L("de", "German", "Deutsch", "Deutschland, Österreich, Schweiz, Belgien, Luxemburg"),
  L("it", "Italian", "Italiano", "Italia, Svizzera, San Marino"),
  L("nl", "Dutch", "Nederlands", "Nederland, België, Suriname"),
  L("zh", "Chinese (Simplified)", "简体中文", "中国, 新加坡"),
  L("zh-TW", "Chinese (Traditional)", "繁體中文", "台灣, 香港, 澳門"),
  L("ja", "Japanese", "日本語", "日本"),
  L("ko", "Korean", "한국어", "대한민국, 조선"),
  L("ru", "Russian", "Русский", "Россия, Беларусь, Казахстан, Кыргызстан"),
  L("tr", "Turkish", "Türkçe", "Türkiye, Kıbrıs"),
  L("hi", "Hindi", "हिन्दी", "India"),
  L("bn", "Bengali", "বাংলা", "Bangladesh, India"),
  L("ur", "Urdu", "اردو", "Pakistan, India", true),
  L("fa", "Persian", "فارسی", "Iran, Afghanistan, Tajikistan", true),
  L("ps", "Pashto", "پښتو", "Afghanistan", true),
  L("he", "Hebrew", "עברית", "Israel", true),
  L("id", "Indonesian", "Bahasa Indonesia", "Indonesia"),
  L("ms", "Malay", "Bahasa Melayu", "Malaysia, Brunei, Singapore"),
  L("vi", "Vietnamese", "Tiếng Việt", "Việt Nam"),
  L("th", "Thai", "ไทย", "ประเทศไทย"),
  L("lo", "Lao", "ລາວ", "Laos"),
  L("km", "Khmer", "ខ្មែរ", "Cambodia"),
  L("my", "Burmese", "မြန်မာ", "Myanmar"),
  L("fil", "Filipino", "Filipino", "Philippines"),
  L("el", "Greek", "Ελληνικά", "Ελλάδα, Κύπρος"),
  L("pl", "Polish", "Polski", "Polska"),
  L("uk", "Ukrainian", "Українська", "Україна"),
  L("ro", "Romanian", "Română", "România, Moldova"),
  L("cs", "Czech", "Čeština", "Česko"),
  L("sk", "Slovak", "Slovenčina", "Slovensko"),
  L("hu", "Hungarian", "Magyar", "Magyarország"),
  L("sv", "Swedish", "Svenska", "Sverige, Finland"),
  L("da", "Danish", "Dansk", "Danmark"),
  L("nb", "Norwegian", "Norsk", "Norge"),
  L("fi", "Finnish", "Suomi", "Suomi"),
  L("is", "Icelandic", "Íslenska", "Ísland"),
  L("et", "Estonian", "Eesti", "Eesti"),
  L("lv", "Latvian", "Latviešu", "Latvija"),
  L("lt", "Lithuanian", "Lietuvių", "Lietuva"),
  L("bg", "Bulgarian", "Български", "България"),
  L("sr", "Serbian", "Српски", "Србија, Босна и Херцеговина"),
  L("hr", "Croatian", "Hrvatski", "Hrvatska, Bosna i Hercegovina"),
  L("bs", "Bosnian", "Bosanski", "Bosna i Hercegovina"),
  L("sl", "Slovenian", "Slovenščina", "Slovenija"),
  L("mk", "Macedonian", "Македонски", "Северна Македонија"),
  L("sq", "Albanian", "Shqip", "Shqipëria, Kosovë"),
  L("mt", "Maltese", "Malti", "Malta"),
  L("ga", "Irish", "Gaeilge", "Éire"),
  L("lb", "Luxembourgish", "Lëtzebuergesch", "Lëtzebuerg"),
  L("ca", "Catalan", "Català", "Andorra, España"),
  L("eu", "Basque", "Euskara", "España"),
  L("gl", "Galician", "Galego", "España"),
  L("cy", "Welsh", "Cymraeg", "Wales"),
  L("be", "Belarusian", "Беларуская", "Беларусь"),
  L("ka", "Georgian", "ქართული", "საქართველო"),
  L("hy", "Armenian", "Հայերեն", "Հայաստան"),
  L("az", "Azerbaijani", "Azərbaycanca", "Azərbaycan"),
  L("kk", "Kazakh", "Қазақша", "Қазақстан"),
  L("uz", "Uzbek", "Oʻzbekcha", "Oʻzbekiston"),
  L("ky", "Kyrgyz", "Кыргызча", "Кыргызстан"),
  L("tg", "Tajik", "Тоҷикӣ", "Тоҷикистон"),
  L("tk", "Turkmen", "Türkmençe", "Türkmenistan"),
  L("mn", "Mongolian", "Монгол", "Монгол Улс"),
  L("ne", "Nepali", "नेपाली", "Nepal"),
  L("si", "Sinhala", "සිංහල", "Sri Lanka"),
  L("ta", "Tamil", "தமிழ்", "Sri Lanka, Singapore, India"),
  L("te", "Telugu", "తెలుగు", "India"),
  L("mr", "Marathi", "मराठी", "India"),
  L("gu", "Gujarati", "ગુજરાતી", "India"),
  L("kn", "Kannada", "ಕನ್ನಡ", "India"),
  L("ml", "Malayalam", "മലയാളം", "India"),
  L("pa", "Punjabi", "ਪੰਜਾਬੀ", "India, Pakistan"),
  L("dz", "Dzongkha", "རྫོང་ཁ", "Bhutan"),
  L("dv", "Dhivehi", "ދިވެހި", "Maldives", true),
  L("ku", "Kurdish", "Kurdî", "Iraq"),
  L("am", "Amharic", "አማርኛ", "Ethiopia"),
  L("ti", "Tigrinya", "ትግርኛ", "Eritrea, Ethiopia"),
  L("om", "Oromo", "Afaan Oromoo", "Ethiopia"),
  L("so", "Somali", "Soomaali", "Somalia, Djibouti"),
  L("ha", "Hausa", "Hausa", "Niger, Nigeria"),
  L("yo", "Yoruba", "Yorùbá", "Nigeria, Benin"),
  L("ig", "Igbo", "Igbo", "Nigeria"),
  L("rw", "Kinyarwanda", "Ikinyarwanda", "Rwanda"),
  L("rn", "Kirundi", "Ikirundi", "Burundi"),
  L("mg", "Malagasy", "Malagasy", "Madagascar"),
  L("zu", "Zulu", "isiZulu", "South Africa"),
  L("xh", "Xhosa", "isiXhosa", "South Africa, Zimbabwe"),
  L("af", "Afrikaans", "Afrikaans", "South Africa, Namibia"),
  L("st", "Sesotho", "Sesotho", "Lesotho, South Africa"),
  L("tn", "Setswana", "Setswana", "Botswana, South Africa"),
  L("ss", "Swati", "siSwati", "Eswatini, South Africa"),
  L("sn", "Shona", "chiShona", "Zimbabwe"),
  L("nd", "Ndebele", "isiNdebele", "Zimbabwe"),
  L("ny", "Chichewa", "Chichewa", "Malawi, Zimbabwe"),
  L("sg", "Sango", "Sängö", "Centrafrique"),
  L("wo", "Wolof", "Wolof", "Sénégal"),
  L("ff", "Fula", "Pulaar", "Sénégal, Guinée, Mali"),
  L("bm", "Bambara", "Bamanankan", "Mali"),
  L("tet", "Tetum", "Tetun", "Timor-Leste"),
  L("ht", "Haitian Creole", "Kreyòl ayisyen", "Haïti"),
  L("qu", "Quechua", "Runa Simi", "Perú, Bolivia"),
  L("ay", "Aymara", "Aymar aru", "Bolivia, Perú"),
  L("gn", "Guarani", "Avañe'ẽ", "Paraguay, Bolivia"),
  L("mi", "Māori", "Te Reo Māori", "New Zealand"),
  L("sm", "Samoan", "Gagana Sāmoa", "Samoa"),
  L("to", "Tongan", "Lea faka-Tonga", "Tonga"),
  L("fj", "Fijian", "Vosa Vakaviti", "Fiji"),
  L("bi", "Bislama", "Bislama", "Vanuatu"),
  L("tpi", "Tok Pisin", "Tok Pisin", "Papua New Guinea"),
  L("mh", "Marshallese", "Kajin M̧ajeļ", "Marshall Islands"),
  L("na", "Nauruan", "Dorerin Naoero", "Nauru"),
  L("gil", "Gilbertese", "Taetae ni Kiribati", "Kiribati"),
  L("tvl", "Tuvaluan", "Te Ggana Tuuvalu", "Tuvalu"),
  L("kl", "Greenlandic", "Kalaallisut", "Greenland"),
  L("fo", "Faroese", "Føroyskt", "Faroe Islands"),
  L("la", "Latin", "Latina", "Vatican"),
];

import { COUNTRY_LANGUAGE } from "./countries";

/** Countries (ISO codes) whose single primary language is `code`. */
export function countriesOf(code: string): string[] {
  return Object.entries(COUNTRY_LANGUAGE).filter(([, l]) => l === code).map(([c]) => c);
}

/** Localised country name (falls back to the ISO code). */
export function countryName(iso: string, displayLang = "fr"): string {
  try { return new Intl.DisplayNames([displayLang, "en"], { type: "region" }).of(iso) ?? iso; } catch { return iso; }
}

export const BUILTIN = new Set(["fr", "en", "sw"]);

/** Offered languages: only the three official ZUKA PAY languages (French, English, Swahili). */
export const WORLD_LANGUAGES: LangInfo[] = CATALOG
  .filter((l) => BUILTIN.has(l.code))
  .map((l) => ({ ...l, countries: countriesOf(l.code).map((c) => countryName(c, "en")).join(", ") }));

export function findLanguage(code: string | null | undefined): LangInfo | undefined {
  if (!code) return undefined;
  return WORLD_LANGUAGES.find((l) => l.code.toLowerCase() === code.toLowerCase());
}

/** Official language for a device locale: fr, en or sw (country first, then language, default fr). */
export function matchDeviceLanguage(locale: string): string {
  let region: string | undefined;
  try { region = new Intl.Locale(locale).maximize().region; } catch { region = locale.split(/[-_]/)[1]; }
  const byCountry = region ? COUNTRY_LANGUAGE[region.toUpperCase()] : undefined;
  if (byCountry && findLanguage(byCountry)) return byCountry;
  const base = locale.toLowerCase().split(/[-_]/)[0];
  return findLanguage(base)?.code ?? "fr";
}
