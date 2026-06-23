import { redis } from '../../shared/lib/redis';

const TTL_SEC = 60;

export async function getWorkspaceLabelsCache(wid: string): Promise<string | null> {
  return redis.get(`workspace:${wid}:labels`);
}

export async function setWorkspaceLabelsCache(wid: string, payload: string): Promise<void> {
  await redis.setex(`workspace:${wid}:labels`, TTL_SEC, payload);
}

export async function clearWorkspaceLabelsCache(wid: string): Promise<void> {
  await redis.del(`workspace:${wid}:labels`);
}
