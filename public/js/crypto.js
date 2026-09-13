class PasswordCrypto {

  #encoder
  #decoder

  #algorithmName
  #algorithmLength
  #ivLength

  constructor() {
    this.#encoder = new TextEncoder()
    this.#decoder = new TextDecoder()

    this.#algorithmName = "AES-GCM"
    this.#algorithmLength = 256
    this.#ivLength = 12
  }

  /**
   * @param {string} buffer
   * @returns {string}
   */
  #bufferToBase64(buffer) {
    let binary = ""
    const bytes = new Uint8Array(buffer)
    const len = bytes.byteLength
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i])
    }

    return btoa(binary)
  }

  /**
   * @param {string} base64
   * @returns {string}
   */
  #base64ToBuffer(base64) {
    const binaryString = atob(base64)
    const len = binaryString.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    return bytes.buffer
  }

  /**
   * @param {string} base64
   * @returns {number}
   */
  #decodedByteLength(base64) {
    if (typeof base64 != "string" || base64.length === 0) {
      return -1
    }
    try {
      return this.#base64ToBuffer(base64).byteLength
    } catch {
      return -1
    }
  }

  /**
   * AES-256-GCM raw key is 32 bytes of standard Base64.
   * @param {string} key
   * @returns {boolean}
   */
  isValidShareKey(key) {
    return this.#decodedByteLength(key) === this.#algorithmLength / 8
  }

  /**
   * AES-GCM IV is 12 bytes of standard Base64.
   * @param {string} iv
   * @returns {boolean}
   */
  isValidShareIv(iv) {
    return this.#decodedByteLength(iv) === this.#ivLength
  }

  /**
   * @param {string} password Plain text password
   * @returns {Promise<{ password: string, key: string, iv: string }>} Encrypted password
   */
  async encryptPassword(password) {
    const iv = new Uint8Array(this.#ivLength)
    window.crypto.getRandomValues(iv)

    const key = await window.crypto.subtle.generateKey(
      {
        name: this.#algorithmName,
        length: this.#algorithmLength,
      },
      true,
      ["encrypt", "decrypt"],
    )
    const rawKey = await window.crypto.subtle.exportKey("raw", key)

    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: this.#algorithmName,
        iv: iv,
      },
      key,
      this.#encoder.encode(password),
    )

    return {
      password: this.#bufferToBase64(encrypted),
      key: this.#bufferToBase64(rawKey),
      iv: this.#bufferToBase64(iv.buffer),
    }
  }

  /**
   * @param {string} password Encrypted password
   * @param {string} key
   * @param {string} iv
   * @returns {Promise<string>} Plain text password
   */
  async decryptPassword(password, key, iv) {
    const ckey = await window.crypto.subtle.importKey(
      "raw",
      this.#base64ToBuffer(key),
      {
        name: this.#algorithmName,
        length: this.#algorithmLength,
      },
      true,
      ["encrypt", "decrypt"],
    )

    const dpassword = await window.crypto.subtle.decrypt(
      {
        name: this.#algorithmName,
        iv: this.#base64ToBuffer(iv),
      },
      ckey,
      this.#base64ToBuffer(password),
    )

    return this.#decoder.decode(dpassword)
  }
}
