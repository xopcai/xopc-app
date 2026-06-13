import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

let openRef: SwipeableMethods | null = null;

export function onSwipeableWillOpen(ref: SwipeableMethods): void {
  if (openRef && openRef !== ref) {
    openRef.close();
  }
  openRef = ref;
}

export function onSwipeableClose(ref: SwipeableMethods): void {
  if (openRef === ref) {
    openRef = null;
  }
}
