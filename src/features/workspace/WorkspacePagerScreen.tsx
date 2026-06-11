import { StyleSheet, View } from 'react-native';

import { WorkspaceHomeScreen } from './WorkspaceHomeScreen';

export function WorkspacePagerScreen() {
  return (
    <View style={styles.screen}>
      <WorkspaceHomeScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});

