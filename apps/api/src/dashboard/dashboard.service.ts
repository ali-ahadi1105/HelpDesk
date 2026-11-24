import { Injectable } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async get(workspaceId: string) {
    const cacheKey = `taskflow:workspace:${workspaceId}:dashboard`;
    const cached = await this.redis.getJson<DashboardData>(cacheKey);
    if (cached) return cached;

    const [projects, taskGroups, upcoming, activity] = await Promise.all([
      this.prisma.project.findMany({
        where: { workspaceId },
        select: { id: true, name: true, color: true, _count: { select: { tasks: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.task.groupBy({
        by: ['status'],
        where: { project: { workspaceId } },
        _count: { _all: true },
      }),
      this.prisma.task.findMany({
        where: {
          project: { workspaceId },
          dueDate: { gte: new Date() },
          status: { not: TaskStatus.DONE },
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          priority: true,
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 8,
      }),
      this.prisma.activity.findMany({
        where: { workspaceId },
        include: { actor: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
    ]);

    const counts = { TODO: 0, IN_PROGRESS: 0, DONE: 0 } as Record<TaskStatus, number>;
    for (const group of taskGroups) counts[group.status] = group._count._all;
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const data: DashboardData = {
      summary: {
        totalTasks: total,
        completedTasks: counts.DONE,
        inProgressTasks: counts.IN_PROGRESS,
        completionRate: total ? Math.round((counts.DONE / total) * 100) : 0,
        projectCount: projects.length,
      },
      projects,
      upcomingDeadlines: upcoming,
      activity,
    };
    await this.redis.setJson(cacheKey, data, 30);
    return data;
  }
}

export interface DashboardData {
  summary: {
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    completionRate: number;
    projectCount: number;
  };
  projects: unknown[];
  upcomingDeadlines: unknown[];
  activity: unknown[];
}
