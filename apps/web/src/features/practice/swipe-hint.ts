import { readJson, writeJson } from '../../lib/storage';

/**
 * The swipe hint (D-135): on a touch screen, a hand shows that the card can be swiped, for the
 * direction that just became available. Left = Next, right = Back, in every language (D-096).
 * Each direction is shown a few times per device, and never again once the user has swiped that
 * way by themselves.
 */
export type SwipeDir = 'left' | 'right';
export type SwipeHintDirs = SwipeDir | 'both';

/** How many times each direction is shown on a device. */
export const SWIPE_HINT_TIMES = 2;
/** Phones and tablets: no hover, a finger as the pointer. */
export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';

const KEY = 'myvocab.swipeHint';

export type SwipeHintSeen = {
  left: number;
  right: number;
  leftLearned: boolean;
  rightLearned: boolean;
};

const EMPTY: SwipeHintSeen = { left: 0, right: 0, leftLearned: false, rightLearned: false };

function isSeen(v: unknown): v is SwipeHintSeen {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.left === 'number' &&
    typeof o.right === 'number' &&
    typeof o.leftLearned === 'boolean' &&
    typeof o.rightLearned === 'boolean'
  );
}

export function readSwipeHintSeen(): SwipeHintSeen {
  return readJson('local', KEY, isSeen) ?? EMPTY;
}

/** Counts a hint as shown, for each direction it showed. */
export function recordSwipeHintShown(dirs: SwipeHintDirs): void {
  const seen = readSwipeHintSeen();
  writeJson('local', KEY, {
    ...seen,
    left: seen.left + (dirs === 'right' ? 0 : 1),
    right: seen.right + (dirs === 'left' ? 0 : 1),
  });
}

/** The user swiped this way by themselves: no more hints for it. */
export function markSwipeLearned(dir: SwipeDir): void {
  const seen = readSwipeHintSeen();
  const learned = dir === 'left' ? 'leftLearned' : 'rightLearned';
  if (seen[learned]) return;
  writeJson('local', KEY, { ...seen, [learned]: true });
}

/**
 * Which hint to show now, if any: the directions available on the card that the device still has
 * to learn, leaving out any already shown on this card.
 */
export function pickSwipeHint(
  available: { left: boolean; right: boolean },
  seen: SwipeHintSeen,
  shownOnCard: ReadonlySet<SwipeDir> = new Set(),
): SwipeHintDirs | null {
  const wants = (dir: SwipeDir) =>
    available[dir] &&
    !shownOnCard.has(dir) &&
    !seen[dir === 'left' ? 'leftLearned' : 'rightLearned'] &&
    seen[dir] < SWIPE_HINT_TIMES;
  const left = wants('left');
  const right = wants('right');
  return left && right ? 'both' : left ? 'left' : right ? 'right' : null;
}
