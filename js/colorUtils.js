function normalizeClassColor(color, fallback = '#333333') {
  if (typeof color === 'string') {
    const trimmed = color.trim();
    if (trimmed && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
      return trimmed;
    }
  }

  return fallback;
}

if (typeof module !== 'undefined') {
  module.exports = { normalizeClassColor };
}
