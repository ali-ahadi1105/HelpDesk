import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Check API dependencies' })
  async check(): Promise<{ status: string; services: Record<string, string> }> {
    const services: Record<string, string> = { database: 'up', redis: 'up' };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      services.database = 'down';
    }
    try {
      await this.redis.ping();
    } catch {
      services.redis = 'down';
    }
    const status = Object.values(services).every((value) => value === 'up') ? 'ok' : 'degraded';
    if (status === 'degraded') throw new ServiceUnavailableException({ status, services });
    return { status, services };
  }
}
