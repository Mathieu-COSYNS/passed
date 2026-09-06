class Language {

  #storageKey
  #languages
  #language
  #errorHandler
  #defaultLang

  constructor(errorHandler, defaultLang) {
    this.#storageKey = "language"
    this.#languages = new Map()
    this.#errorHandler = errorHandler
    this.#defaultLang = defaultLang

    const setLanguage = localStorage.getItem(this.#storageKey)
    if (setLanguage == null) {
      this.setLanguage(this.#defaultLang)
      this.#language = this.#defaultLang
      return
    }

    this.#language = setLanguage
    this.setLanguage(this.#language)
  }

  async #fetchLanguage(lang) {
    const cached = this.#languages.get(lang)
    if (cached != null) {
      return cached
    }

    const f = await fetch(`/lang/${lang}.json`)
    const fetched = await f.json()

    this.#languages.set(lang, fetched)
    return fetched
  }

  #translate(key, ...args) {
    let bundle = this.#languages.get(this.#language)
    if (bundle == null) {
      bundle = {}
    }

    let value = bundle[key];
    if (value == undefined) {
      value = key
    }

    for (let i = 0; i < args.length; i++) {
      value = value.replaceAll(`{${i}}`, args[i])
    }

    return value
  }

  #translatePage() {
    const elements = document.getElementsByTagName("*")
    for (const element of elements) {
      const key = element.getAttribute("t")
      if (key == null) {
        continue
      }

      element.innerHTML = this.#translate(key)
    }
  }

  setLanguage(lang) {
    this.#fetchLanguage(lang)
      .then(() => {
        this.#language = lang
        localStorage.setItem(this.#storageKey, lang)

        this.#translatePage()
      })
      .catch((err) => this.#errorHandler(err))
  }
}