const INTRO_SEEN_KEY = 'gilded-ace-intro-seen-v1';
let seenInMemory = false;

/** A tab session remembers completion/skip; blocked storage never blocks entry. */
export function hasSeenIntro(): boolean {
  if (seenInMemory) return true;
  try { return window.sessionStorage.getItem(INTRO_SEEN_KEY) === 'seen'; }
  catch { return false; }
}

export function rememberIntro(): void {
  seenInMemory = true;
  try { window.sessionStorage.setItem(INTRO_SEEN_KEY, 'seen'); }
  catch { /* The in-memory fallback still covers remounts in this document. */ }
}
