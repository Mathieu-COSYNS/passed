const REMAINING_VIEWS_HEADER = "X-Remaining-Views"
const EXPIRES_IN_HEADER = "X-Expires-In"

/**
 * @param {Headers} headers
 * @param {string} name
 * @returns {number | null}
 */
function headerInt(headers, name) {
  const parsed = parseInt(headers.get(name), 10)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

/**
 * @param {Headers} headers
 * @returns {{ remainingViews: number | null, expiresIn: number | null }}
 */
function shareMeta(headers) {
  return {
    remainingViews: headerInt(headers, REMAINING_VIEWS_HEADER),
    expiresIn: headerInt(headers, EXPIRES_IN_HEADER),
  }
}

class Backend {

  constructor() { }

  /**
   * @param {string} password Encrypted password
   * @param {number} expiresIn Seconds until the password will be deleted on the server
   * @param {number} [view] Remaining views before delete (default 1, max 10)
   * @returns {Promise<string>} Password Id
   */
  async createPassword(password, expiresIn, view = 1) {
    const res = await fetch("/api/password", {
      method: "POST",
      body: JSON.stringify({
        "password": password,
        "expires-in": expiresIn,
        "view": view,
      }),
    })
    if (res.status === 507) {
      throw new Error("Failed to upload password: the server is full")
    }
    if (res.status === 400) {
      const msg = await res.text()
      throw new Error(`Failed to upload password, got status 400: ${msg}`)
    }
    if (res.status != 200) {
      throw new Error(`Failed to upload password, got status ${res.status}`)
    }

    const id = await res.json()
    return id
  }

  /**
   * @param {string} id Password id
   * @returns {Promise<{ remainingViews: number | null, expiresIn: number | null } | null>}
   *   Share metadata if it exists, or null if it is gone
   */
  async getPasswordMeta(id) {
    const res = await fetch(`/api/password/${id}`, {
      method: "HEAD",
    })
    switch (res.status) {
      case 204:
        return shareMeta(res.headers)
      case 404:
        return null
      default:
        throw new Error(`Failed to check if password exists: ${res.status}`)
    }
  }

  /**
   * @param {string} id Password id
   * @returns {Promise<{ password: string, remainingViews: number | null, expiresIn: number | null } | null>}
   *   Encrypted password and remaining share metadata, or null if the share is gone
   */
  async getPassword(id) {
    const res = await fetch(`/api/password/${id}`)
    if (res.status === 404) {
      return null
    }
    if (!res.ok) {
      const msg = await res.text()
      throw new Error(`Failed to get password: ${res.status}: ${msg}`)
    }

    const password = await res.json()
    return { password, ...shareMeta(res.headers) }
  }
}
