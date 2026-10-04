import { createPlatformData } from './platform-data.js';
import { createPlatformRealtime } from './platform-realtime.js';

// Single page-facing composition root. Set either section to false when an
// interactive does not need that capability.
export function createInteractiveRuntime({ data = {}, realtime = false,
  dataProvider, realtimeProvider } = {}) {
  const dataFacade = data === false ? null : createPlatformData({
    ...data,
    provider: data.provider || dataProvider
  });
  const realtimeFacade = realtime === false ? null : createPlatformRealtime({
    ...realtime,
    provider: realtime.provider || realtimeProvider
  });
  let disposed = false;

  return {
    data: dataFacade,
    realtime: realtimeFacade,
    dispose() {
      if (disposed) return;
      disposed = true;
      realtimeFacade?.dispose();
      dataFacade?.dispose?.();
    }
  };
}
