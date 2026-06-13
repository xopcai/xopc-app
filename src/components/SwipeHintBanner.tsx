import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { useMessages } from '../i18n/messages';
import { storage } from '../storage/mmkv';
import { useTheme } from '../theme';

const SWIPE_HINT_KEY = 'prefs.hasSeenSwipeHint';

type SwipeHintBannerProps = {
  hasItems: boolean;
};

export function SwipeHintBanner({ hasItems }: SwipeHintBannerProps) {
  const { colors } = useTheme();
  const li = useMessages().listInteraction;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasItems) {
      setVisible(false);
      return;
    }
    if (storage.getString(SWIPE_HINT_KEY)) return;
    setVisible(true);
    storage.set(SWIPE_HINT_KEY, true);
  }, [hasItems]);

  if (!visible) return null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.text, { color: colors.text.tertiary }]}>{li.swipeHint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  text: {
    fontSize: 12,
    textAlign: 'center',
  },
});
