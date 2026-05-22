import { useCallback, useMemo, useState } from 'react';
import { Linking, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { useGatewayStore } from '../../stores/gateway-store';
import { resolveEffectiveGatewayBaseUrl } from '../../stores/gateway-types';
import {
  buildHtmlWebViewSource,
  shouldAllowHtmlWebViewNavigation,
  type HtmlWebViewSource,
} from './html-preview-source';

export type HtmlPreviewPaneProps = {
  workspaceRelativePath?: string;
  htmlContent?: string | null;
  sessionKey?: string | null;
  mutedColor: string;
};

function previewUriFromSource(source: HtmlWebViewSource | null): string | undefined {
  return source && 'uri' in source ? source.uri : undefined;
}

export function HtmlPreviewPane({
  workspaceRelativePath,
  htmlContent,
  sessionKey,
  mutedColor,
}: HtmlPreviewPaneProps) {
  const isDark = useColorScheme() === 'dark';
  const apiUrl = useGatewayStore((s) => s.apiUrl);
  const token = useGatewayStore((s) => s.token);
  const gatewayBaseUrl = useGatewayStore((s) =>
    resolveEffectiveGatewayBaseUrl({
      activeBaseUrl: s.activeBaseUrl,
      baseUrl: s.baseUrl,
      lanUrl: s.lanUrl,
    }),
  );
  const [loading, setLoading] = useState(true);
  const [webError, setWebError] = useState<string | null>(null);

  const source = useMemo(
    () =>
      buildHtmlWebViewSource({
        workspaceRelativePath,
        htmlContent,
        sessionKey,
        apiUrl,
        token,
        gatewayBaseUrl,
      }),
    [apiUrl, gatewayBaseUrl, htmlContent, sessionKey, token, workspaceRelativePath],
  );

  const previewUri = previewUriFromSource(source);

  const handleNavigation = useCallback(
    (request: Pick<WebViewNavigation, 'url'>) => {
      const { url } = request;
      if (shouldAllowHtmlWebViewNavigation(url, previewUri, gatewayBaseUrl)) {
        return true;
      }
      void Linking.openURL(url).catch(() => undefined);
      return false;
    },
    [gatewayBaseUrl, previewUri],
  );

  if (!source) {
    return (
      <View style={styles.center}>
        <Text style={{ color: mutedColor }}>无法加载 HTML 预览。</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <WebView
        source={source}
        style={styles.webview}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        onLoadStart={() => {
          setLoading(true);
          setWebError(null);
        }}
        onLoadEnd={() => setLoading(false)}
        onError={(event) => {
          setLoading(false);
          setWebError(event.nativeEvent.description || 'WebView 加载失败');
        }}
        onHttpError={(event) => {
          if (event.nativeEvent.statusCode >= 400) {
            setLoading(false);
            setWebError(`HTTP ${event.nativeEvent.statusCode}`);
          }
        }}
        onShouldStartLoadWithRequest={handleNavigation}
      />
      {loading ? (
        <View
          style={[
            styles.loadingOverlay,
            { backgroundColor: isDark ? 'rgba(17,24,39,0.82)' : 'rgba(255,255,255,0.88)' },
          ]}
          pointerEvents="none"
        >
          <ActivityIndicator />
          <Text style={{ color: mutedColor }}>正在渲染页面…</Text>
        </View>
      ) : null}
      {webError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>HTML 渲染失败：{webError}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    lineHeight: 18,
  },
});
