import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ActivityType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

export interface UploadedAttachment {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface AttachmentDownload {
  fileName: string;
  mimeType: string;
  size: number;
  content: Buffer;
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private get uploadRoot(): string {
    return resolve(process.env.UPLOAD_DIR ?? resolve(process.cwd(), 'uploads'));
  }

  async list(workspaceId: string, taskId: string) {
    await this.assertTaskInWorkspace(workspaceId, taskId);
    return this.prisma.taskAttachment.findMany({
      where: { taskId },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upload(workspaceId: string, taskId: string, userId: string, file: UploadedAttachment) {
    const task = await this.assertTaskInWorkspace(workspaceId, taskId);
    if (!file) throw new UnprocessableEntityException('An attachment file is required');
    if (file.size > MAX_ATTACHMENT_SIZE) {
      throw new UnprocessableEntityException('Attachments must be 10 MB or smaller');
    }
    if (file.size === 0) throw new UnprocessableEntityException('Attachments cannot be empty');

    const storageName = `${randomUUID()}${this.extensionFor(file.originalname)}`;
    const storagePath = join(this.uploadRoot, storageName);
    await mkdir(this.uploadRoot, { recursive: true });
    await writeFile(storagePath, file.buffer, { flag: 'wx' });

    try {
      const attachment = await this.prisma.taskAttachment.create({
        data: {
          taskId: task.id,
          uploadedById: userId,
          fileName: this.safeFileName(file.originalname),
          url: `/uploads/${storageName}`,
          mimeType: file.mimetype || 'application/octet-stream',
          size: file.size,
        },
        include: { uploadedBy: { select: { id: true, name: true } } },
      });
      await this.prisma.activity.create({
        data: {
          workspaceId,
          projectId: task.projectId,
          taskId: task.id,
          actorId: userId,
          type: ActivityType.ATTACHED,
          entityType: 'attachment',
          entityId: attachment.id,
          message: `attached ${attachment.fileName}`,
        },
      });
      await this.redis.deleteWorkspaceCache(workspaceId);
      return attachment;
    } catch (error) {
      await unlink(storagePath).catch(() => undefined);
      throw error;
    }
  }

  async download(workspaceId: string, taskId: string, attachmentId: string): Promise<AttachmentDownload> {
    await this.assertTaskInWorkspace(workspaceId, taskId);
    const attachment = await this.prisma.taskAttachment.findFirst({
      where: { id: attachmentId, taskId },
    });
    if (!attachment) throw new NotFoundException('Attachment was not found');

    const storageName = this.storageNameFromUrl(attachment.url);
    const content = await readFile(join(this.uploadRoot, storageName)).catch(() => {
      throw new NotFoundException('Attachment file was not found');
    });
    return {
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      content,
    };
  }

  async remove(workspaceId: string, taskId: string, attachmentId: string, userId: string): Promise<void> {
    const task = await this.assertTaskInWorkspace(workspaceId, taskId);
    const attachment = await this.prisma.taskAttachment.findFirst({
      where: { id: attachmentId, taskId },
    });
    if (!attachment) throw new NotFoundException('Attachment was not found');

    await this.prisma.taskAttachment.delete({ where: { id: attachment.id } });
    await this.prisma.activity.create({
      data: {
        workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        actorId: userId,
        type: ActivityType.DELETED,
        entityType: 'attachment',
        entityId: attachment.id,
        message: `removed attachment ${attachment.fileName}`,
      },
    });
    await unlink(join(this.uploadRoot, this.storageNameFromUrl(attachment.url))).catch(() => undefined);
    await this.redis.deleteWorkspaceCache(workspaceId);
  }

  private async assertTaskInWorkspace(workspaceId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, project: { workspaceId } },
      select: { id: true, projectId: true },
    });
    if (!task) throw new NotFoundException('Task was not found');
    return task;
  }

  private safeFileName(fileName: string): string {
    const normalized = fileName
      .trim()
      .replace(/[\\/\0\r\n]/g, '_')
      .replace(/[^\x20-\x7e\u00a0-\uffff]/g, '_');
    return normalized || 'attachment';
  }

  private extensionFor(fileName: string): string {
    const extension = this.safeFileName(fileName).split('.').pop();
    return extension && extension.length <= 10 ? `.${extension.toLowerCase()}` : '';
  }

  private storageNameFromUrl(url: string): string {
    const storageName = url.replace(/^\/uploads\//, '');
    if (!/^[a-f0-9-]+(?:\.[a-z0-9]{1,10})?$/i.test(storageName)) {
      throw new NotFoundException('Attachment file was not found');
    }
    return storageName;
  }
}
