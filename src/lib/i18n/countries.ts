/**
 * 1 country → 1 primary language → 1 ZUKA PAY translation.
 * Edit a country's language by changing its value here (ISO 3166 code → language code from languages.ts CATALOG).
 */
export const COUNTRY_LANGUAGE: Record<string, string> = {
  // Afrique
  CD: "fr", CG: "fr", CM: "fr", CF: "fr", TD: "fr", GA: "fr", GQ: "es", BI: "rn", RW: "rw",
  KE: "sw", TZ: "sw", UG: "en", SS: "en", ET: "am", ER: "ti", DJ: "fr", SO: "so", SD: "ar",
  EG: "ar", LY: "ar", TN: "ar", DZ: "ar", MA: "ar", EH: "ar", MR: "ar",
  SN: "fr", GM: "en", GW: "pt", GN: "fr", SL: "en", LR: "en", CI: "fr", ML: "fr", BF: "fr",
  NE: "fr", GH: "en", TG: "fr", BJ: "fr", NG: "en", CV: "pt", ST: "pt",
  AO: "pt", ZM: "en", MW: "ny", MZ: "pt", ZW: "en", BW: "tn", NA: "en", ZA: "en", LS: "st",
  SZ: "ss", MG: "mg", MU: "en", SC: "en", KM: "fr",
  // Europe
  FR: "fr", BE: "nl", LU: "fr", MC: "fr", CH: "de", DE: "de", AT: "de", LI: "de", NL: "nl",
  GB: "en", IE: "en", IS: "is", ES: "es", AD: "ca", PT: "pt", IT: "it", SM: "it", VA: "it", MT: "mt",
  DK: "da", FO: "fo", GL: "kl", NO: "nb", SE: "sv", FI: "fi", EE: "et", LV: "lv", LT: "lt",
  PL: "pl", CZ: "cs", SK: "sk", HU: "hu", SI: "sl", HR: "hr", BA: "bs", RS: "sr", ME: "sr",
  MK: "mk", AL: "sq", XK: "sq", GR: "el", CY: "el", BG: "bg", RO: "ro", MD: "ro",
  UA: "uk", BY: "ru", RU: "ru",
  // Asie / Moyen-Orient
  TR: "tr", GE: "ka", AM: "hy", AZ: "az", KZ: "kk", UZ: "uz", KG: "ky", TJ: "tg", TM: "tk",
  IR: "fa", AF: "fa", PK: "ur", IN: "hi", BD: "bn", NP: "ne", BT: "dz", LK: "si", MV: "dv",
  CN: "zh", TW: "zh-TW", HK: "zh-TW", MO: "zh-TW", MN: "mn", JP: "ja", KR: "ko", KP: "ko",
  VN: "vi", LA: "lo", KH: "km", TH: "th", MM: "my", MY: "ms", BN: "ms", SG: "en",
  ID: "id", TL: "tet", PH: "fil",
  IL: "he", PS: "ar", JO: "ar", LB: "ar", SY: "ar", IQ: "ar", SA: "ar", KW: "ar", BH: "ar",
  QA: "ar", AE: "ar", OM: "ar", YE: "ar",
  // Amériques
  US: "en", CA: "en", MX: "es", GT: "es", BZ: "en", HN: "es", SV: "es", NI: "es", CR: "es",
  PA: "es", CU: "es", DO: "es", HT: "ht", JM: "en", BS: "en", BB: "en", TT: "en", PR: "es",
  AG: "en", DM: "en", GD: "en", KN: "en", LC: "en", VC: "en",
  CO: "es", VE: "es", EC: "es", PE: "es", BO: "es", CL: "es", AR: "es", UY: "es", PY: "es",
  BR: "pt", GY: "en", SR: "nl",
  // Océanie
  AU: "en", NZ: "en", PG: "tpi", FJ: "en", SB: "en", VU: "bi", WS: "sm", TO: "to",
  KI: "en", TV: "tvl", NR: "na", MH: "mh", FM: "en", PW: "en",
};
