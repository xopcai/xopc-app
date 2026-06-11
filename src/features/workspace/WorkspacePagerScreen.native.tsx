import { useCallback, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useFocusEffect } from '@react-navigation/native';

import { ChatScreen } from '../chat/ChatScreen';
import { NotesScreen } from '../notes/NotesScreen';

import { WorkspaceHomeScreen } from './WorkspaceHomeScreen';
import { WorkspaceNavigationProvider } from './workspace-navigation-context';

const CHAT_PAGE_INDEX = 0;
const HOME_PAGE_INDEX = 1;

export function WorkspacePagerScreen() {
  const pagerRef = useRef<PagerView>(null);
  const [pageIndex, setPageIndex] = useState(HOME_PAGE_INDEX);

  const navigateToHome = useCallback(() => {
    pagerRef.current?.setPage(HOME_PAGE_INDEX);
    setPageIndex(HOME_PAGE_INDEX);
  }, []);

  const openAskAiNative = useCallback(() => {
    pagerRef.current?.setPage(CHAT_PAGE_INDEX);
    setPageIndex(CHAT_PAGE_INDEX);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (pageIndex === HOME_PAGE_INDEX) return false;
        navigateToHome();
        return true;
      });

      return () => subscription.remove();
    }, [navigateToHome, pageIndex]),
  );

  return (
    <WorkspaceNavigationProvider onOpenAskAiNative={openAskAiNative}>
      <View style={styles.screen}>
        <PagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={HOME_PAGE_INDEX}
          onPageSelected={(event) => setPageIndex(event.nativeEvent.position)}
        >
          <View key="chat" style={styles.page}>
            <ChatScreen embedded onRequestHome={navigateToHome} />
          </View>
          <View key="home" style={styles.page}>
            <WorkspaceHomeScreen />
          </View>
          <View key="notes" style={styles.page}>
            <NotesScreen embedded onRequestHome={navigateToHome} />
          </View>
        </PagerView>
      </View>
    </WorkspaceNavigationProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  pager: { flex: 1 },
  page: { flex: 1 },
});
