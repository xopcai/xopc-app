import { memo } from 'react';
import { Banner } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';

type GatewayOfflineBannerProps = {
  visible: boolean;
};

export const GatewayOfflineBanner = memo(function GatewayOfflineBanner({
  visible,
}: GatewayOfflineBannerProps) {
  const m = useMessages();
  if (!visible) return null;
  return (
    <Banner visible icon="cloud-off-outline" style={{ backgroundColor: '#FFF8E1' }}>
      {m.gateway.offlineBanner}
    </Banner>
  );
});
