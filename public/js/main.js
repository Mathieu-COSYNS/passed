/**
 * @param {(e: *) => void} errorHandler
 * @param {Backend} backend
 * @param {PasswordCrypto} crypto
 * @param {string} urlSplit
 */
function initShare(errorHandler, backend, crypto, urlSplit) {
  const form = document.querySelector("form#share-form")
  const fieldset = document.querySelector("fieldset#share-fieldset")
  const submit = document.querySelector("button#share-submit")
  const dialog = document.querySelector("dialog#share-dialog")
  const link = document.querySelector("input#share-link")
  const copy = document.querySelector("button#share-copy")
  const close = document.querySelector("button#share-close")
  const generate = document.querySelector("a#share-generate")
  const password = document.querySelector("textarea#share-password")

  form.addEventListener("submit", async (e) => {
    const data = new FormData(e.target)
    e.preventDefault()

    try {
      fieldset.disabled = true
      submit.ariaBusy = "true"

      const encrypted = await crypto.encryptPassword(data.get("password"))
      const id = await backend.createPassword(
        encrypted.password,
        parseInt(data.get("expires-in")),
      )

      const url = new URL(window.location)
      url.hash = [id, encrypted.key, encrypted.iv].join(urlSplit)
      url.search = ""

      link.value = url.toString()
      dialog.showModal()
    } catch (e) {
      errorHandler(e)
    } finally {
      fieldset.disabled = false
      submit.ariaBusy = "false"
    }
  })

  if (navigator.clipboard == null || typeof navigator.clipboard.writeText != "function") {
    copy.hidden = true
  }

  copy.addEventListener("click", async () => {
    link.select()
    link.setSelectionRange(0, 99999)
    try {
      await navigator.clipboard.writeText(link.value)
    } catch (e) {
      errorHandler(e)
    }
  })

  close.addEventListener("click", () => {
    dialog.close()
  })

  generate.addEventListener("click", () => {
    let result = ""
    const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    for (let i = 0; i < 12; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length))
    }

    password.value = result
  })
}

/**
 * @param {(e: *) => void} errorHandler
 * @param {Backend} backend
 * @param {PasswordCrypto} crypto
 * @param {string} urlSplit
 * @param {string} hidden
 */
function initView(errorHandler, backend, crypto, urlSplit, hidden) {
  const share = document.querySelector("article#share")
  const loading = document.querySelector("article#loading")
  const confirm = document.querySelector("article#confirm")
  const confirmNo = document.querySelector("button#confirm-no")
  const confirmYes = document.querySelector("button#confirm-yes")
  const notFound = document.querySelector("article#not-found")
  const notFoundOk = document.querySelector("button#not-found-ok")
  const view = document.querySelector("article#view")
  const viewPassword = document.querySelector("textarea#view-password")
  const viewOk = document.querySelector("button#view-ok")

  const hash = window.location.hash
  if (hash == "" || hash == "#") {
    share.classList.remove(hidden)
    return
  }

  const raw = hash.substring(1)
  const [id, key, iv] = raw.split(urlSplit)

  async function load() {
    try {
      loading.classList.remove(hidden)

      const has = await backend.hasPassword(id)
      if (!has) {
        loading.classList.add(hidden)
        notFound.classList.remove(hidden)
        return
      }

      loading.classList.add(hidden)
      confirm.classList.remove(hidden)
    } catch (e) {
      errorHandler(e)
    } finally {
      loading.classList.add(hidden)
    }
  }

  notFoundOk.addEventListener("click", () => {
    notFound.classList.add(hidden)
    share.classList.remove(hidden)
    window.location.hash = ""
  })

  confirmNo.addEventListener("click", () => {
    confirm.classList.add(hidden)
    share.classList.remove(hidden)
    window.location.hash = ""
  })

  confirmYes.addEventListener("click", async () => {
    try {
      confirmYes.ariaBusy = "true"
      confirmNo.disabled = true
      confirmYes.disabled = true

      const encrypted = await backend.getPassword(id)
      const password = await crypto.decryptPassword(encrypted, key, iv)

      viewPassword.value = password
      confirm.classList.add(hidden)
      view.classList.remove(hidden)
      window.location.hash = ""
    } catch (e) {
      errorHandler(e)
    } finally {
      confirmYes.ariaBusy = "false"
      confirmNo.disabled = false
      confirmYes.disabled = false
    }
  })

  viewOk.addEventListener("click", () => {
    view.classList.add(hidden)
    share.classList.remove(hidden)
    window.location.hash = ""
  })

  load()
}

/**
 * @param {Language} language 
 */
function initLanguage(language) {
  const select = document.querySelector("select#language")
  select.value = language.getLanguage()

  select.addEventListener("change", async () => {
    await language.setLanguage(select.value)
    select.value = language.getLanguage()
  })
}

function init() {
  const dialog = document.querySelector("dialog#error")
  const error = document.querySelector("p#error-error")
  const close = document.querySelector("button#error-close")

  /**
   * @param {*} error Error
   */
  function handleError(err) {
    console.error(err)
    error.innerText = err
    dialog.showModal()
  }

  close.addEventListener("click", () => {
    dialog.close()
  })

  const backend = new Backend()
  const crypto = new PasswordCrypto()
  const language = new Language()
  const urlSplit = ":"

  initShare(handleError, backend, crypto, urlSplit)
  initView(handleError, backend, crypto, urlSplit, "hidden")
  initLanguage(language)
}

document.addEventListener("DOMContentLoaded", () => init())
