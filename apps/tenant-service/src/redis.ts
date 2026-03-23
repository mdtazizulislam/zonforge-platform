import { Redis as IORedis } from 'ioredis'
import { redisConfig } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'

const log = createLogger({ service: 'tenant-service:redis' })
let _redis: IORedis | null = null

export function getRedis(): IORedis {
  if (_redis) return _redis
  _redis = new IORedis({
    host: redisConfig.host, port: redisConfig.port,
    password: redisConfig.password,
    tls: redisConfig.tls ? {} : undefined,
    maxRetriesPerRequest: 3,
    retryStrategy: (t: number) => Math.min(t * 100, 3000),
  })
  _redis.on('error', (e: unknown) => log.error({ err: e }, 'Redis error'))
  return _redis
}

export async function closeRedis() {
  if (_redis) { await _redis.quit(); _redis = null }
}
