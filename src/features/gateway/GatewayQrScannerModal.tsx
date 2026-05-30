import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';

import { type ParsedGatewayQr, parseGatewayQrPayload } from './parse-gateway-qr';

export type GatewayQrScannerModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  onScanned: (parsed: ParsedGatewayQr) => void;
  /** Called when camera permission is denied. */
  onCameraDenied?: () => void;
};

export function GatewayQrScannerModal({
  visible,
  onRequestClose,
  onScanned,
  onCameraDenied: _onCameraDenied,
}: GatewayQrScannerModalProps) {
  const insets = useSafeAreaInsets();
  const m = useMessages();
  const l = m.gatewayConnect;
  const [camPermission] = useCameraPermissions();
  const scanCooldown = useRef(0);

  const onBarcodeScanned = useCallback(
    (ev: { data: string }) => {
      if (!visible) return;
      if (Date.now() - scanCooldown.current < 1200) return;
      scanCooldown.current = Date.now();
      const parsed = parseGatewayQrPayload(ev.data);
      if (!parsed.baseUrl && !parsed.token && !parsed.lanUrl && !parsed.pairingSecret) return;
      onScanned(parsed);
      onRequestClose();
    },
    [onRequestClose, onScanned, visible],
  );

  const content = (
    <View style={[styles.root, { paddingTop: insets.top, backgroundColor: '#000' }]}>
      <View style={styles.bar}>
        <Pressable onPress={onRequestClose} hitSlop={12}>
          <Text style={styles.back}>{l.close}</Text>
        </Pressable>
        <Text style={styles.title}>{l.scannerTitle}</Text>
        <View style={{ width: 48 }} />
      </View>
      <View style={styles.cameraWrap}>
        {visible && camPermission?.granted ? (
          <CameraView
            style={styles.camera}
            facing="back"
            active={visible}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onBarcodeScanned}
          />
        ) : null}
      </View>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.hint}>{l.scannerHint}</Text>
      </View>
    </View>
  );

  if (Platform.OS === 'web') {
    if (!visible) return null;
    return <View style={styles.webOverlay}>{content}</View>;
  }

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onRequestClose}>
      {content}
    </Modal>
  );
}

/** Request camera permission before opening the scanner modal. */
export async function requestGatewayQrCameraAccess(
  camPermission: ReturnType<typeof useCameraPermissions>[0],
  requestCamPermission: ReturnType<typeof useCameraPermissions>[1],
  onCameraDenied: () => void,
): Promise<boolean> {
  if (camPermission?.granted) return true;
  const r = await requestCamPermission();
  if (!r.granted) {
    onCameraDenied();
    return false;
  }
  return true;
}

const styles = StyleSheet.create({
  webOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  root: {
    flex: 1,
  },
  cameraWrap: {
    flex: 1,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    zIndex: 2,
  },
  back: {
    color: '#fff',
    fontSize: 17,
    padding: 8,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  hint: {
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
});
