import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AttachmentsService, MAX_ATTACHMENT_SIZE } from './attachments.service';

describe('AttachmentsService', () => {
  let storageRoot: string;
  let previousUploadDir: string | undefined;

  const prisma = {
    task: { findFirst: jest.fn() },
    taskAttachment: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    activity: { create: jest.fn() },
  };
  const redis = { deleteWorkspaceCache: jest.fn() };
  const service = new AttachmentsService(prisma as never, redis as never);

  beforeEach(async () => {
    jest.clearAllMocks();
    storageRoot = await mkdtemp(join(tmpdir(), 'taskflow-attachments-'));
    previousUploadDir = process.env.UPLOAD_DIR;
    process.env.UPLOAD_DIR = join(storageRoot, 'uploads');
  });

  afterEach(async () => {
    if (previousUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = previousUploadDir;
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('refuses to upload when the task belongs to another workspace', async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    await expect(
      service.upload('workspace-a', 'task-b', 'user-a', {
        originalname: 'notes.txt',
        mimetype: 'text/plain',
        size: 4,
        buffer: Buffer.from('data'),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.taskAttachment.create).not.toHaveBeenCalled();
  });

  it('rejects files larger than the configured limit', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 'task-a', projectId: 'project-a' });

    await expect(
      service.upload('workspace-a', 'task-a', 'user-a', {
        originalname: 'huge.bin',
        mimetype: 'application/octet-stream',
        size: MAX_ATTACHMENT_SIZE + 1,
        buffer: Buffer.alloc(1),
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(prisma.taskAttachment.create).not.toHaveBeenCalled();
  });

  it('stores the file and records attachment metadata', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 'task-a', projectId: 'project-a' });
    prisma.taskAttachment.create.mockImplementation(({ data }: { data: { url: string } }) => ({
      id: 'attachment-a',
      fileName: 'notes.txt',
      url: data.url,
      size: 4,
      mimeType: 'text/plain',
    }));

    const attachment = await service.upload('workspace-a', 'task-a', 'user-a', {
      originalname: 'notes.txt',
      mimetype: 'text/plain',
      size: 4,
      buffer: Buffer.from('data'),
    });

    expect(attachment.id).toBe('attachment-a');
    expect(prisma.taskAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ taskId: 'task-a', fileName: 'notes.txt', size: 4 }),
      }),
    );
    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'ATTACHED', taskId: 'task-a' }),
      }),
    );

    const stored = await readFile(join(storageRoot, 'uploads', attachment.url.replace('/uploads/', '')));
    expect(stored.toString()).toBe('data');
  });

  it('removes the stored file when the metadata cannot be created', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 'task-a', projectId: 'project-a' });
    prisma.taskAttachment.create.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.upload('workspace-a', 'task-a', 'user-a', {
        originalname: 'notes.txt',
        mimetype: 'text/plain',
        size: 4,
        buffer: Buffer.from('data'),
      }),
    ).rejects.toThrow('database unavailable');

    const { readdir } = await import('node:fs/promises');
    await expect(readdir(join(storageRoot, 'uploads'))).resolves.toEqual([]);
  });

  it('downloads only attachments that belong to the requested task', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 'task-a', projectId: 'project-a' });
    prisma.taskAttachment.findFirst.mockResolvedValue({
      id: 'attachment-a',
      taskId: 'task-a',
      fileName: 'notes.txt',
      mimeType: 'text/plain',
      size: 4,
      url: '/uploads/attachment-a.txt',
    });

    await expect(
      service.download('workspace-a', 'task-a', 'attachment-a'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.taskAttachment.findFirst).toHaveBeenCalledWith({
      where: { id: 'attachment-a', taskId: 'task-a' },
    });
  });

  it('rejects a stored path that escapes the upload directory', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 'task-a', projectId: 'project-a' });
    prisma.taskAttachment.findFirst.mockResolvedValue({
      id: 'attachment-a',
      taskId: 'task-a',
      fileName: 'notes.txt',
      mimeType: 'text/plain',
      size: 4,
      url: '/uploads/../../etc/passwd',
    });

    await expect(
      service.download('workspace-a', 'task-a', 'attachment-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
