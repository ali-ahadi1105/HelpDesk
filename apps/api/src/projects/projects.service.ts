import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateColumnDto } from './dto/create-column.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

const DEFAULT_COLUMNS = [
  { title: 'Todo', status: TaskStatus.TODO, color: '#8b95a7' },
  { title: 'In Progress', status: TaskStatus.IN_PROGRESS, color: '#f59e0b' },
  { title: 'Done', status: TaskStatus.DONE, color: '#22c55e' },
];

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async list(workspaceId: string) {
    return this.prisma.project.findMany({
      where: { workspaceId },
      include: {
        _count: { select: { tasks: true } },
        columns: { select: { id: true, title: true, status: true, color: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(workspaceId: string, userId: string, dto: CreateProjectDto) {
    const project = await this.prisma.project.create({
      data: {
        workspaceId,
        createdById: userId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        color: dto.color ?? '#6d5dfc',
        columns: {
          create: DEFAULT_COLUMNS.map((column, index) => ({ ...column, position: index + 1 })),
        },
      },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
    await this.recordActivity({
      workspaceId,
      projectId: project.id,
      actorId: userId,
      type: ActivityType.CREATED,
      entityType: 'project',
      entityId: project.id,
      message: `created project ${project.name}`,
    });
    await this.redis.deleteWorkspaceCache(workspaceId);
    return project;
  }

  async get(workspaceId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      include: {
        columns: {
          orderBy: { position: 'asc' },
          include: {
            tasks: {
              orderBy: { position: 'asc' },
              include: {
                assignee: { select: { id: true, name: true, email: true } },
                _count: { select: { comments: true, attachments: true } },
              },
            },
          },
        },
      },
    });
    if (!project) throw new NotFoundException('Project was not found');
    return project;
  }

  async update(workspaceId: string, projectId: string, userId: string, dto: UpdateProjectDto) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw new NotFoundException('Project was not found');
    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
      },
    });
    await this.recordActivity({
      workspaceId,
      projectId,
      actorId: userId,
      type: ActivityType.UPDATED,
      entityType: 'project',
      entityId: projectId,
      message: `updated project ${updated.name}`,
    });
    await this.redis.deleteWorkspaceCache(workspaceId);
    return updated;
  }

  async addColumn(workspaceId: string, projectId: string, userId: string, dto: CreateColumnDto) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw new NotFoundException('Project was not found');
    const max = await this.prisma.boardColumn.aggregate({
      where: { projectId },
      _max: { position: true },
    });
    const column = await this.prisma.boardColumn.create({
      data: {
        projectId,
        title: dto.title.trim(),
        status: dto.status ?? TaskStatus.TODO,
        color: dto.color ?? '#8b95a7',
        position: (max._max.position ?? 0) + 1,
      },
    });
    await this.recordActivity({
      workspaceId,
      projectId,
      actorId: userId,
      type: ActivityType.CREATED,
      entityType: 'column',
      entityId: column.id,
      message: `added column ${column.title}`,
    });
    await this.redis.deleteWorkspaceCache(workspaceId);
    return column;
  }

  private recordActivity(data: {
    workspaceId: string;
    projectId: string;
    actorId: string;
    type: ActivityType;
    entityType: string;
    entityId: string;
    message: string;
  }): Promise<unknown> {
    return this.prisma.activity.create({ data });
  }
}
