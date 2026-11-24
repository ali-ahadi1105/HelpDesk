import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';

describe('ProjectsService', () => {
  const prisma = {
    project: { findFirst: jest.fn(), delete: jest.fn() },
    boardColumn: { findFirst: jest.fn(), count: jest.fn(), update: jest.fn(), delete: jest.fn() },
    activity: { create: jest.fn() },
  };
  const redis = { deleteWorkspaceCache: jest.fn() };
  const service = new ProjectsService(prisma as never, redis as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refuses to delete a project from another workspace', async () => {
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(service.remove('workspace-a', 'project-b', 'user-a')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.project.delete).not.toHaveBeenCalled();
  });

  it('deletes a project that belongs to the workspace', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: 'project-a', name: 'Launch' });

    await service.remove('workspace-a', 'project-a', 'user-a');

    expect(prisma.project.delete).toHaveBeenCalledWith({ where: { id: 'project-a' } });
    expect(redis.deleteWorkspaceCache).toHaveBeenCalledWith('workspace-a');
  });

  it('refuses to remove a column that still holds tasks', async () => {
    prisma.boardColumn.findFirst.mockResolvedValue({
      id: 'column-a',
      title: 'Doing',
      _count: { tasks: 2 },
    });

    await expect(
      service.removeColumn('workspace-a', 'project-a', 'column-a', 'user-a'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.boardColumn.delete).not.toHaveBeenCalled();
  });

  it('refuses to remove the last column of a project', async () => {
    prisma.boardColumn.findFirst.mockResolvedValue({
      id: 'column-a',
      title: 'Doing',
      _count: { tasks: 0 },
    });
    prisma.boardColumn.count.mockResolvedValue(1);

    await expect(
      service.removeColumn('workspace-a', 'project-a', 'column-a', 'user-a'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.boardColumn.delete).not.toHaveBeenCalled();
  });

  it('removes an empty column', async () => {
    prisma.boardColumn.findFirst.mockResolvedValue({
      id: 'column-a',
      title: 'Doing',
      _count: { tasks: 0 },
    });
    prisma.boardColumn.count.mockResolvedValue(3);

    await service.removeColumn('workspace-a', 'project-a', 'column-a', 'user-a');

    expect(prisma.boardColumn.delete).toHaveBeenCalledWith({ where: { id: 'column-a' } });
    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'DELETED', entityType: 'column' }),
      }),
    );
  });

  it('renames a column inside the workspace project', async () => {
    prisma.boardColumn.findFirst.mockResolvedValue({ id: 'column-a', title: 'Doing' });
    prisma.boardColumn.update.mockResolvedValue({ id: 'column-a', title: 'In review' });

    const updated = await service.updateColumn(
      'workspace-a',
      'project-a',
      'column-a',
      'user-a',
      { title: 'In review' },
    );

    expect(updated.title).toBe('In review');
    expect(prisma.boardColumn.update).toHaveBeenCalledWith({
      where: { id: 'column-a' },
      data: { title: 'In review' },
    });
  });
});
