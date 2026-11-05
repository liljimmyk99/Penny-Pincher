/** Apple platforms use ⌘ where others use Ctrl. */
export const isApplePlatform = () => /Mac|iPhone|iPad/.test(navigator.userAgent);
