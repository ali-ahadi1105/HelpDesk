import {
  Controller,
  Delete,
  Get,
  Param,
  ParseFilePipeBuilder,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { AuthUser } from '../common/types/authenticated-request';
import { AttachmentsService, MAX_ATTACHMENT_SIZE } from './attachments.service';

@ApiTags('attachments')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/tasks/:taskId/attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get()
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER)
  @ApiOperation({ summary: 'List task attachments' })
  list(@Param('workspaceId') workspaceId: string, @Param('taskId') taskId: string) {
    return this.attachments.list(workspaceId, taskId);
  }

  @Post()
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_SIZE } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Attach a file to a task' })
  upload(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile(new ParseFilePipeBuilder().build({ fileIsRequired: true }))
    file: Express.Multer.File,
  ) {
    return this.attachments.upload(workspaceId, taskId, user.id, file);
  }

  @Get(':attachmentId')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER)
  @ApiOperation({ summary: 'Download a task attachment' })
  async download(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ): Promise<void> {
    const attachment = await this.attachments.download(workspaceId, taskId, attachmentId);
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Content-Length', attachment.size);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
    );
    response.send(attachment.content);
  }

  @Delete(':attachmentId')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @ApiOperation({ summary: 'Remove a task attachment' })
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.attachments.remove(workspaceId, taskId, attachmentId, user.id);
  }
}
