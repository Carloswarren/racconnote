
export const generateId = (): string => {
  // Fallback for older browsers or non-secure contexts where crypto.randomUUID might fail
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (e) {
      // Fallback if it fails
    }
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
};
