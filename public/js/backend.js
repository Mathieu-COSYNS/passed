class Backend {

  constructor() { }

  /**
   * @param {string} password Encrypted password
   * @param {number} expiresIn Seconds until the password will be deleted on the server
   * @returns {Promise<string>} Password Id
   */
  async createPassword(password, expiresIn) {
    const res = await fetch("/api/password", {
      method: "POST",
      body: JSON.stringify({
        "password": password,
        "expires-in": expiresIn,
      }),
    })
    if (res.status != 200) {
      throw new Error(`Failed to upload password, got status ${res.status}`)
    }

    const id = await res.json()
    return id
  }

  /**
   * @param {string} id Password id
   * @returns {Promise<bool>} If the password exists
   */
  async hasPassword(id) {
    const res = await fetch(`/api/password/${id}`, {
      method: "HEAD",
    })
    switch (res.status) {
      case 204:
        return true
      case 404:
        return false
      default:
        throw new Error(`Failed to check if password exists: ${res.status}`)
    }
  }

  /**
   * @param {string} id Password id
   * @returns {Promise<string>} Encrypted password
   */
  async getPassword(id) {
    const res = await fetch(`/api/password/${id}`)
    if (!res.ok) {
      const msg = await res.text()
      throw new Error(`Failed to get password: ${res.status}: ${msg}`)
    }

    const password = await res.json()
    return password
  }
}
