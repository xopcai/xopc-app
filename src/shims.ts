/** Side-effect imports for native navigation (Expo / React Navigation). */
import 'react-native-gesture-handler';

import { Platform } from 'react-native';

if (Platform.OS !== 'web') {
  // Remote tunnel E2EE uses Web Crypto (X25519, HKDF, AES-GCM). React Native has no crypto.subtle.
  const { install } = require('react-native-quick-crypto') as typeof import('react-native-quick-crypto');
  install();
}
