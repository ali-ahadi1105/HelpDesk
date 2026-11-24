import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateColumnDto } from './dto/create-column.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
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

  async remove(workspaceId: string, projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true, name: true },
    });
    if (!project) throw new NotFoundException('Project was not found');

    await this.prisma.activity.create({
      data: {
        workspaceId,
        projectId: null,
        actorId: userId,
        type: ActivityType.DELETED,
        entityType: 'project',
        entityId: project.id,
        message: `deleted project ${project.name}`,
      },
    });
    await this.prisma.project.delete({ where: { id: project.id } });
    await this.redis.deleteWorkspaceCache(workspaceId);
  }

  async updateColumn(
    workspaceId: string,
    projectId: string,
    columnId: string,
    userId: string,
    dto: UpdateColumnDto,
  ) {
    const column = await this.prisma.boardColumn.findFirst({
      where: { id: columnId, projectId, project: { workspaceId } },
    });
    if (!column) throw new NotFoundException('Column was not found');

    const updated = await this.prisma.boardColumn.update({
      where: { id: column.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
      },
    });
    await this.recordActivity({
      workspaceId,
      projectId,
      actorId: userId,
      type: ActivityType.UPDATED,
      entityType: 'column',
      entityId: column.id,
      message: `updated column ${updated.title}`,
    });
    await this.redis.deleteWorkspaceCache(workspaceId);
    return updated;
  }

  async removeColumn(workspaceId: string, projectId: string, columnId: string, userId: string): Promise<void> {
    const column = await this.prisma.boardColumn.findFirst({
      where: { id: columnId, projectId, project: { workspaceId } },
      include: { _count: { select: { tasks: true } } },
    });
    if (!column) throw new NotFoundException('Column was not found');
    if (column._count.tasks > 0) {
      throw new BadRequestException('Move or delete the tasks in this column before removing it');
    }

    const remaining = await this.prisma.boardColumn.count({ where: { projectId } });
    if (remaining <= 1) throw new BadRequestException('A project must keep at least one column');

    await this.prisma.boardColumn.delete({ where: { id: column.id } });
    await this.recordActivity({
      workspaceId,
      projectId,
      actorId: userId,
      type: ActivityType.DELETED,
      entityType: 'column',
      entityId: column.id,
      message: `deleted column ${column.title}`,
    });
    await this.redis.deleteWorkspaceCache(workspaceId);
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
