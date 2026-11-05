/**
 * Moves `id` to position `to` among the movable (unlocked) rows. Locked rows
 * (the protected "Other") keep their place. Returns the full new id order, or
 * null when nothing would change.
 */
export function moveAmongUnlocked<T extends { id: string; locked: boolean }>(
  rows: readonly T[],
  id: string,
  to: number,
): string[] | null {
  const movable = rows.filter((r) => !r.locked);
  const from = movable.findIndex((r) => r.id === id);
  if (from < 0 || to < 0 || to >= movable.length || from === to) return null;
  const next = movable.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  let k = 0;
  return rows.map((r) => (r.locked ? r.id : next[k++].id));
}
