import Redis from 'ioredis'
import { redisConfig } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'

const log = createLogger({ service: 'auth-service:redis' })

let _redis: Redis | null = null

export function getRedis(): Redis {
  if (_redis) return _redis

  _redis = new Redis({
    host:           redisConfig.host,
    port:           redisConfig.port,
    password:       redisConfig.password,
    tls:            redisConfig.tls ? {} : undefined,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 100, 3000),
    lazyConnect: false,
  })

  _redis.on('connect',   () => log.info('Redis connected'))
  _redis.on('error',  (e) => log.error({ err: e }, 'Redis error'))
  _redis.on('close',     () => log.warn('Redis connection closed'))

  return _redis
}

export async function closeRedis() {
  if (_redis) { await _redis.quit(); _redis = null }
}
