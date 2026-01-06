export const isValidEmail = (email: string): boolean => {
    if (!email) return false;

    // Trim spaces
    const value = email.trim();

    // RFC 5322–inspired, practical regex (not insane)
    const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/;

    return EMAIL_REGEX.test(value);
};
