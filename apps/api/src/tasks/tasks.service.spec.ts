import { NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  const prisma = {
    project: { findFirst: jest.fn() },
    boardColumn: { findFirst: jest.fn() },
    task: { aggregate: jest.fn(), create: jest.fn() },
    membership: { findUnique: jest.fn() },
    activity: { create: jest.fn() },
  };
  const redis = { deleteWorkspaceCache: jest.fn() };
  const service = new TasksService(prisma as never, redis as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refuses to create a task when the project belongs to another workspace', async () => {
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(
      service.create('workspace-a', 'project-b', 'user-a', {
        title: 'Injected task',
        columnId: 'column-b',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'project-b', workspaceId: 'workspace-a' },
      }),
    );
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('creates a task once the project is bound to the workspace', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: 'project-a' });
    prisma.boardColumn.findFirst.mockResolvedValue({ id: 'column-a', status: 'TODO' });
    prisma.task.aggregate.mockResolvedValue({ _max: { position: 3 } });
    prisma.task.create.mockResolvedValue({ id: 'task-a', title: 'Valid task' });

    const task = await service.create('workspace-a', 'project-a', 'user-a', {
      title: 'Valid task',
      columnId: 'column-a',
    });

    expect(task).toEqual({ id: 'task-a', title: 'Valid task' });
    expect(prisma.boardColumn.findFirst).toHaveBeenCalledWith({
      where: { id: 'column-a', projectId: 'project-a' },
    });
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId: 'project-a', columnId: 'column-a' }),
      }),
    );
  });
});
