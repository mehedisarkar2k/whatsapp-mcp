const CORE_DATA_EPOCH_OFFSET = 978307200;

export function coreDataToISO(timestamp: number): string {
  const unixSeconds = timestamp + CORE_DATA_EPOCH_OFFSET;
  return new Date(unixSeconds * 1000).toISOString();
}

export function getCoreDataThreshold(days: number): number {
  const thresholdUnixSeconds = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
  return thresholdUnixSeconds - CORE_DATA_EPOCH_OFFSET;
}

export function isoToCoreData(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000) - CORE_DATA_EPOCH_OFFSET;
}
