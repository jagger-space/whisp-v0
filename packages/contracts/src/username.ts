// A function to normalize the username if unique and follows this constraint policies!
// 3–20 ASCII letters, digits or underscores; trim and lowercase
export const normalizeUsername = (username: unknown): string => {
    if (typeof username !== 'string') {
        throw new Error('Username must be a string')
    }

    const normalized = username.trim().toLowerCase()

    if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
        throw new Error('Username must be 3-20 ASCII letters, digits, or underscores')
    }
    return normalized
}
