import Redis from 'ioredis'
import { redisConfig } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'

const log = createLogger({ service: 'tenant-service:redis' })
let _redis: Redis | null = null

export function getRedis(): Redis {
  if (_redis) return _redis
  _redis = new Redis({
    host: redisConfig.host, port: redisConfig.port,
    password: redisConfig.password,
    tls: redisConfig.tls ? {} : undefined,
    maxRetriesPerRequest: 3,
    retryStrategy: (t) => Math.min(t * 100, 3000),
  })
  _redis.on('error', (e) => log.error({ err: e }, 'Redis error'))
  return _redis
}

export async function closeRedis() {
  if (_redis) { await _redis.quit(); _redis = null }
}
