import { useEffect, useState } from 'react';

import { useGatewayConfigured } from '../../query/sessions';
import { getGatewayHealthMonitor } from './gateway-health-monitor';

export function useGatewayHealth(): { gatewayOnline: boolean } {
  const configured = useGatewayConfigured();
  const [gatewayOnline, setGatewayOnline] = useState(true);

  useEffect(() => {
    if (!configured) {
      setGatewayOnline(true);
      return;
    }
    const monitor = getGatewayHealthMonitor();
    monitor.start((online) => setGatewayOnline(online));
    return () => monitor.stop();
  }, [configured]);

  return { gatewayOnline };
}
