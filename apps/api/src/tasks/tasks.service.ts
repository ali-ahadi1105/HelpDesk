import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType, Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async create(workspaceId: string, projectId: string, userId: string, dto: CreateTaskDto) {
    const column = await this.prisma.boardColumn.findFirst({
      where: { id: dto.columnId, projectId },
    });
    if (!column) throw new BadRequestException('Column does not belong to this project');
    if (dto.assigneeId) await this.assertWorkspaceMember(workspaceId, dto.assigneeId);

    const max = await this.prisma.task.aggregate({
      where: { columnId: column.id },
      _max: { position: true },
    });
    const task = await this.prisma.task.create({
      data: {
        projectId,
        columnId: column.id,
        createdById: userId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        status: column.status,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        position: (max._max.position ?? 0) + 1,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        _count: { select: { comments: true, attachments: true } },
      },
    });
    await this.recordActivity({
      workspaceId,
      projectId,
      taskId: task.id,
      actorId: userId,
      type: ActivityType.CREATED,
      entityType: 'task',
      entityId: task.id,
      message: `created task ${task.title}`,
    });
    await this.redis.deleteWorkspaceCache(workspaceId);
    return task;
  }

  async list(workspaceId: string, projectId: string) {
    return this.prisma.task.findMany({
      where: { project: { workspaceId }, projectId },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        _count: { select: { comments: true, attachments: true } },
      },
      orderBy: { position: 'asc' },
    });
  }

  async get(workspaceId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, project: { workspaceId } },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
        comments: {
          include: { author: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
        attachments: {
          include: { uploadedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
        activities: {
          include: { actor: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!task) throw new NotFoundException('Task was not found');
    return task;
  }

  async update(workspaceId: string, taskId: string, userId: string, dto: UpdateTaskDto) {
    const task = await this.findTask(workspaceId, taskId);
    if (dto.assigneeId) await this.assertWorkspaceMember(workspaceId, dto.assigneeId);
    const updated = await this.prisma.task.update({
      where: { id: task.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId || null } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        _count: { select: { comments: true, attachments: true } },
      },
    });
    await this.recordActivity({
      workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      actorId: userId,
      type: ActivityType.UPDATED,
      entityType: 'task',
      entityId: task.id,
      message: `updated task ${updated.title}`,
    });
    await this.redis.deleteWorkspaceCache(workspaceId);
    return updated;
  }

  async move(workspaceId: string, taskId: string, userId: string, dto: MoveTaskDto) {
    const task = await this.findTask(workspaceId, taskId);
    const column = await this.prisma.boardColumn.findFirst({
      where: { id: dto.columnId, projectId: task.projectId },
    });
    if (!column) throw new BadRequestException('Column does not belong to this project');
    const updated = await this.prisma.task.update({
      where: { id: task.id },
      data: {
        columnId: column.id,
        status: column.status,
        completedAt: column.status === TaskStatus.DONE ? new Date() : null,
        ...(dto.position !== undefined ? { position: dto.position } : {}),
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        _count: { select: { comments: true, attachments: true } },
      },
    });
    await this.recordActivity({
      workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      actorId: userId,
      type: ActivityType.MOVED,
      entityType: 'task',
      entityId: task.id,
      message: `moved task ${updated.title} to ${column.title}`,
      metadata: { columnId: column.id, status: column.status },
    });
    await this.redis.deleteWorkspaceCache(workspaceId);
    return updated;
  }

  async remove(workspaceId: string, taskId: string, userId: string): Promise<void> {
    const task = await this.findTask(workspaceId, taskId);
    await this.prisma.activity.create({
      data: {
        workspaceId,
        projectId: task.projectId,
        taskId: null,
        actorId: userId,
        type: ActivityType.DELETED,
        entityType: 'task',
        entityId: task.id,
        message: `deleted task ${task.title}`,
      },
    });
    await this.prisma.task.delete({ where: { id: task.id } });
    await this.redis.deleteWorkspaceCache(workspaceId);
  }

  async comment(workspaceId: string, taskId: string, userId: string, dto: CreateCommentDto) {
    const task = await this.findTask(workspaceId, taskId);
    const comment = await this.prisma.taskComment.create({
      data: { taskId: task.id, authorId: userId, body: dto.body.trim() },
      include: { author: { select: { id: true, name: true, email: true } } },
    });
    await this.recordActivity({
      workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      actorId: userId,
      type: ActivityType.COMMENTED,
      entityType: 'comment',
      entityId: comment.id,
      message: `commented on ${task.title}`,
    });
    await this.redis.deleteWorkspaceCache(workspaceId);
    return comment;
  }

  private async findTask(workspaceId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, project: { workspaceId } },
    });
    if (!task) throw new NotFoundException('Task was not found');
    return task;
  }

  private async assertWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) throw new BadRequestException('Assignee must be a workspace member');
  }

  private recordActivity(data: {
    workspaceId: string;
    projectId: string;
    taskId?: string;
    actorId: string;
    type: ActivityType;
    entityType: string;
    entityId: string;
    message: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<unknown> {
    return this.prisma.activity.create({ data });
  }
}
