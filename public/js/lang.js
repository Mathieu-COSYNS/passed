/**
 * Loads JSON translations and fills elements that have a `t` attribute.
 */
class Language {
  #localStorageKey;
  #allowedLanguages;
  #translationsCache;
  #currentLanguage;

  constructor() {
    this.#localStorageKey = "language";
    this.#allowedLanguages = ["en", "de", "fr"];
    this.#translationsCache = new Map();
    this.#currentLanguage = this.#resolveLanguage(
      localStorage.getItem(this.#localStorageKey),
    );
    this.setLanguage(this.#currentLanguage);
  }

  /**
   * Returns `language` when it is allowlisted; otherwise the default language.
   * @param {string | null} language
   * @returns {string}
   */
  #resolveLanguage(language) {
    return this.#allowedLanguages.includes(language)
      ? language
      : this.#allowedLanguages[0];
  }

  /**
   * @param {string} language Allowlisted language code.
   * @returns {Promise<Record<string, string>>}
   */
  async #loadTranslations(language) {
    const cached = this.#translationsCache.get(language);
    if (cached != null) {
      return cached;
    }

    const response = await fetch(`/lang/${language}.json`);
    if (!response.ok) {
      throw new Error(
        `Failed to load language ${language}: ${response.status}`,
      );
    }

    const translations = await response.json();
    this.#translationsCache.set(language, translations);
    return translations;
  }

  /**
   * @param {Record<string, string>} translations
   */
  #applyTranslations(translations) {
    document.documentElement.lang = this.#currentLanguage;

    for (const element of document.querySelectorAll("[t]")) {
      const key = element.getAttribute("t");
      element.textContent = translations[key] ?? key;
    }

    for (const element of document.querySelectorAll("[t-aria-label]")) {
      const key = element.getAttribute("t-aria-label");
      element.setAttribute("aria-label", translations[key] ?? key);
    }
  }

  /**
   * Language code currently applied to the page.
   * @returns {string}
   */
  getLanguage() {
    return this.#currentLanguage;
  }

  /**
   * Switches the UI to `language`. Unknown codes fall back to the default
   * language. A failed load leaves the current language in place.
   * @param {string | null} language
   */
  async setLanguage(language) {
    const resolved = this.#resolveLanguage(language);

    try {
      const translations = await this.#loadTranslations(resolved);
      this.#currentLanguage = resolved;
      localStorage.setItem(this.#localStorageKey, resolved);
      this.#applyTranslations(translations);
    } catch (err) {
      console.error(err);
    }
  }
}
