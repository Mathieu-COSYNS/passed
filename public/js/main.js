/**
 * @param {(e: *) => void} errorHandler
 * @param {Backend} backend
 * @param {PasswordCrypto} crypto
 * @param {string} urlSplit
 * @param {Language} language
 */
function initShare(errorHandler, backend, crypto, urlSplit, language) {
  const form = document.querySelector("form#share-form")
  const fieldset = document.querySelector("fieldset#share-fieldset")
  const submit = document.querySelector("button#share-submit")
  const dialog = document.querySelector("dialog#share-dialog")
  const link = document.querySelector("input#share-link")
  const copy = document.querySelector("button#share-copy")
  const close = document.querySelector("button#share-close")
  const generate = document.querySelector("button#share-generate")
  const password = document.querySelector("textarea#share-password")

  form.addEventListener("submit", async (e) => {
    const data = new FormData(e.target)
    e.preventDefault()

    try {
      fieldset.disabled = true
      submit.ariaBusy = "true"

      const plain = data.get("password")
      if (typeof plain != "string" || plain.length === 0) {
        throw new Error(await language.t("password-required"))
      }

      const expiresIn = parseInt(data.get("expires-in"), 10)
      if (!Number.isInteger(expiresIn) || expiresIn <= 0) {
        throw new Error(await language.t("expiry-invalid"))
      }

      const encrypted = await crypto.encryptPassword(plain)
      const viewRaw = data.get("view")
      const parsedView = parseInt(viewRaw == null || viewRaw === "" ? "1" : String(viewRaw), 10)
      const view = Number.isInteger(parsedView) && parsedView > 0 ? parsedView : 1
      const id = await backend.createPassword(
        encrypted.password,
        expiresIn,
        view,
      )

      const url = new URL(window.location)
      url.hash = [id, encrypted.key, encrypted.iv].join(urlSplit)
      url.search = ""

      password.value = ""
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
    password.value = crypto.generatePassword()
  })
}

/**
 * @param {number} seconds
 * @param {string} locale
 * @returns {string}
 */
function formatRelativeExpiry(seconds, locale) {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always" })
  const value = Math.max(0, Math.floor(seconds))
  if (value >= 86400) {
    return rtf.format(Math.round(value / 86400), "day")
  }
  if (value >= 3600) {
    return rtf.format(Math.round(value / 3600), "hour")
  }
  if (value >= 60) {
    return rtf.format(Math.round(value / 60), "minute")
  }
  return rtf.format(value, "second")
}

/**
 * @param {(e: *) => void} errorHandler
 * @param {Backend} backend
 * @param {PasswordCrypto} crypto
 * @param {string} urlSplit
 * @param {string} hidden
 * @param {Language} language
 */
function initView(errorHandler, backend, crypto, urlSplit, hidden, language) {
  const share = document.querySelector("article#share")
  const loading = document.querySelector("article#loading")
  const confirm = document.querySelector("article#confirm")
  const confirmNotice = document.querySelector("p#reveal-password-notice")
  const confirmNo = document.querySelector("button#confirm-no")
  const confirmYes = document.querySelector("button#confirm-yes")
  const notFound = document.querySelector("article#not-found")
  const notFoundReasons = document.querySelector("p#not-found-reasons")
  const decryptFailed = document.querySelector("p#decrypt-failed")
  const notFoundOk = document.querySelector("button#not-found-ok")
  const view = document.querySelector("article#view")
  const viewPassword = document.querySelector("textarea#view-password")
  const viewStatus = document.querySelector("p#view-status")
  const viewOk = document.querySelector("button#view-ok")

  let id
  let key
  let iv
  /** @type {number | null} */
  let confirmRemaining = null
  /** @type {{ remainingViews: number | null, expiresIn: number | null } | null} */
  let viewMeta = null

  function hideAll() {
    share.classList.add(hidden)
    loading.classList.add(hidden)
    confirm.classList.add(hidden)
    notFound.classList.add(hidden)
    view.classList.add(hidden)
  }

  function setConfirmBusy(busy) {
    confirmYes.ariaBusy = busy ? "true" : "false"
    confirmNo.disabled = busy
    confirmYes.disabled = busy
  }

  function clearStatusMessages() {
    confirmRemaining = null
    viewMeta = null
    confirmNotice.textContent = ""
    viewStatus.textContent = ""
    viewStatus.classList.add(hidden)
  }

  function resetView() {
    hideAll()
    viewPassword.value = ""
    clearStatusMessages()
    setConfirmBusy(false)
    for (const dialog of document.querySelectorAll("dialog[open]")) {
      dialog.close()
    }
  }

  function showShare() {
    hideAll()
    viewPassword.value = ""
    clearStatusMessages()
    share.classList.remove(hidden)
  }

  function showNotFound() {
    notFoundReasons.classList.remove(hidden)
    decryptFailed.classList.add(hidden)
    notFound.classList.remove(hidden)
  }

  function showDecryptFailed() {
    notFoundReasons.classList.add(hidden)
    decryptFailed.classList.remove(hidden)
    notFound.classList.remove(hidden)
  }

  /**
   * @param {number | null} remainingViews
   */
  async function fillConfirmNotice(remainingViews) {
    if (remainingViews == null) {
      confirmNotice.textContent = ""
      return
    }

    const key = remainingViews === 1
      ? "reveal-password-once"
      : "reveal-password-many"
    confirmNotice.textContent = await language.t(key, { x: remainingViews })
  }

  /**
   * @param {{ remainingViews: number | null, expiresIn: number | null }} meta
   */
  async function fillViewStatus(meta) {
    let text = ""
    if (meta.remainingViews != null && meta.remainingViews <= 0) {
      text = await language.t("view-status-last")
    } else if (meta.remainingViews != null && meta.expiresIn != null) {
      const key = meta.remainingViews === 1
        ? "view-status-remaining-one"
        : "view-status-remaining"
      text = await language.t(key, {
        count: meta.remainingViews,
        expiry: formatRelativeExpiry(meta.expiresIn, language.getLanguage()),
      })
    }

    if (text === "") {
      viewStatus.textContent = ""
      viewStatus.classList.add(hidden)
      return
    }

    viewStatus.textContent = text
    viewStatus.classList.remove(hidden)
  }

  async function refreshDynamicMessages() {
    if (!confirm.classList.contains(hidden)) {
      await fillConfirmNotice(confirmRemaining)
    }
    if (!view.classList.contains(hidden) && viewMeta != null) {
      await fillViewStatus(viewMeta)
    }
  }

  /**
   * @param {string} password
   * @param {{ remainingViews: number | null, expiresIn: number | null }} meta
   */
  async function showView(password, meta) {
    viewPassword.value = password
    viewMeta = meta
    confirmRemaining = null
    await fillViewStatus(meta)
    confirm.classList.add(hidden)
    view.classList.remove(hidden)
  }

  /**
   * Share fragments must be exactly `id:key:iv`. Extra `:` pieces are rejected.
   * `id` is 24 letters; `key`/`iv` must decode as a 32-byte AES key and 12-byte IV.
   * @param {string} raw
   * @returns {{ id: string, key: string, iv: string } | null}
   */
  function parseShareFragment(raw) {
    const parts = raw.split(urlSplit)
    if (parts.length !== 3) {
      return null
    }

    const [nextId, nextKey, nextIv] = parts
    if (!/^[A-Za-z]{24}$/.test(nextId)) {
      return null
    }
    if (!crypto.isValidShareKey(nextKey) || !crypto.isValidShareIv(nextIv)) {
      return null
    }

    return { id: nextId, key: nextKey, iv: nextIv }
  }

  function scrubHash() {
    const url = new URL(window.location.href)
    url.hash = ""
    history.replaceState(null, "", url)
  }

  function absorb() {
    const hash = window.location.hash
    if (hash == "" || hash == "#") {
      return false
    }

    const parsed = parseShareFragment(hash.substring(1))
    scrubHash()

    id = parsed?.id
    key = parsed?.key
    iv = parsed?.iv
    if (parsed == null) {
      resetView()
      showNotFound()
      return true
    }

    checkExist()
    return true
  }

  async function checkExist() {
    resetView()

    try {
      loading.classList.remove(hidden)

      const meta = await backend.getPasswordMeta(id)
      if (meta == null) {
        showNotFound()
        return
      }

      confirmRemaining = meta.remainingViews
      await fillConfirmNotice(confirmRemaining)
      confirm.classList.remove(hidden)
    } catch (e) {
      errorHandler(e)
      showShare()
    } finally {
      loading.classList.add(hidden)
    }
  }

  async function revealPassword() {
    try {
      setConfirmBusy(true)

      if (
        id == null ||
        !crypto.isValidShareKey(key) ||
        !crypto.isValidShareIv(iv)
      ) {
        resetView()
        showNotFound()
        return
      }

      const encrypted = await backend.getPassword(id)
      if (encrypted == null) {
        resetView()
        showNotFound()
        return
      }

      try {
        const password = await crypto.decryptPassword(encrypted.password, key, iv)
        await showView(password, encrypted)
      } catch (decryptError) {
        console.error(decryptError)
        resetView()
        showDecryptFailed()
      }
    } catch (e) {
      errorHandler(e)
    } finally {
      setConfirmBusy(false)
    }
  }

  language.onChange(() => {
    void refreshDynamicMessages()
  })
  notFoundOk.addEventListener("click", showShare)
  confirmNo.addEventListener("click", showShare)
  viewOk.addEventListener("click", showShare)
  confirmYes.addEventListener("click", revealPassword)
  window.addEventListener("hashchange", absorb)

  if (!absorb()) {
    showShare()
  }
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

  initShare(handleError, backend, crypto, urlSplit, language)
  initView(handleError, backend, crypto, urlSplit, "hidden", language)
  initLanguage(language)
}

document.addEventListener("DOMContentLoaded", () => init())
