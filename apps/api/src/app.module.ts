import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { WorkspaceGuard } from './common/guards/workspace.guard';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { RedisModule } from './redis/redis.module';
import { TasksModule } from './tasks/tasks.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

function validateConfig(config: Record<string, unknown>): Record<string, unknown> {
  if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!config.JWT_ACCESS_SECRET || String(config.JWT_ACCESS_SECRET).length < 32) {
    throw new Error('JWT_ACCESS_SECRET must contain at least 32 characters');
  }
  if (!config.JWT_REFRESH_SECRET || String(config.JWT_REFRESH_SECRET).length < 32) {
    throw new Error('JWT_REFRESH_SECRET must contain at least 32 characters');
  }
  return config;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }),
    PrismaModule,
    RedisModule,
    AuthModule,
    WorkspacesModule,
    ProjectsModule,
    TasksModule,
    DashboardModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: WorkspaceGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
