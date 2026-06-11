import { memo, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS } from 'react-native-reanimated';

import { motion } from '../../motion';

import { useWorkspaceTransition } from '../workspace/workspace-transition-context';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export const ChatOverlayDismissHandle = memo(function ChatOverlayDismissHandle() {
  const {
    phase,
    setDismissDragFraction,
    completeInteractiveDismiss,
    cancelInteractiveDismiss,
  } = useWorkspaceTransition();

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(8)
        .failOffsetX([-24, 24])
        .onUpdate((event) => {
          if (event.translationY <= 0) {
            runOnJS(setDismissDragFraction)(0);
            return;
          }
          runOnJS(setDismissDragFraction)(event.translationY / SCREEN_HEIGHT);
        })
        .onEnd((event) => {
          const fraction = Math.max(0, event.translationY / SCREEN_HEIGHT);
          if (
            fraction >= motion.dismiss.completeProgress
            || event.velocityY > motion.dismiss.velocityThreshold
          ) {
            runOnJS(completeInteractiveDismiss)();
            return;
          }
          runOnJS(cancelInteractiveDismiss)();
        }),
    [
      cancelInteractiveDismiss,
      completeInteractiveDismiss,
      setDismissDragFraction,
    ],
  );

  if (phase !== 'open' && phase !== 'opening') return null;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={styles.handleZone} accessibilityRole="adjustable" accessibilityLabel="下拉关闭 AI 对话">
        <View style={styles.grabber} />
      </Animated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  handleZone: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 4,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(142,142,147,0.55)',
  },
});
