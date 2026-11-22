import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.get<string>('REDIS_URL', 'redis://localhost:6379'), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.client.on('error', (error) => this.logger.warn(`Redis error: ${error.message}`));
  }

  async connect(): Promise<void> {
    if (this.client.status === 'wait') await this.client.connect();
  }

  async ping(): Promise<string> {
    await this.connect();
    return this.client.ping();
  }

  async isAccessTokenRevoked(jti: string): Promise<boolean> {
    try {
      await this.connect();
      return (await this.client.exists(`taskflow:revoked-access:${jti}`)) === 1;
    } catch {
      return false;
    }
  }

  async revokeAccessToken(jti: string, ttlSeconds: number): Promise<void> {
    await this.connect();
    await this.client.set(`taskflow:revoked-access:${jti}`, '1', 'EX', Math.max(ttlSeconds, 1));
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      await this.connect();
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.connect();
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      this.logger.warn(`Unable to cache ${key}`);
    }
  }

  async deleteWorkspaceCache(workspaceId: string): Promise<void> {
    try {
      await this.connect();
      const keys = await this.client.keys(`taskflow:workspace:${workspaceId}:*`);
      if (keys.length) await this.client.del(...keys);
    } catch {
      this.logger.warn(`Unable to invalidate workspace cache ${workspaceId}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'end') return;
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
