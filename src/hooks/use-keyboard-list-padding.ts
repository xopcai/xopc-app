import { useState } from 'react';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';

/** Bottom inset for scrollable chat content while the IME is visible. */
export function useKeyboardListPadding(): number {
  const { height } = useReanimatedKeyboardAnimation();
  const [padding, setPadding] = useState(0);

  useAnimatedReaction(
    () => Math.abs(height.value),
    (next, prev) => {
      if (next !== prev) {
        runOnJS(setPadding)(next);
      }
    },
    [height],
  );

  return padding;
}
