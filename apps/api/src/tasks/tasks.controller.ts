import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { AuthUser } from '../common/types/authenticated-request';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('workspaces/:workspaceId/projects/:projectId/tasks')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER)
  @ApiOperation({ summary: 'List project tasks' })
  list(@Param('workspaceId') workspaceId: string, @Param('projectId') projectId: string) {
    return this.tasks.list(workspaceId, projectId);
  }

  @Post('workspaces/:workspaceId/projects/:projectId/tasks')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @ApiOperation({ summary: 'Create a task' })
  create(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.create(workspaceId, projectId, user.id, dto);
  }

  @Get('workspaces/:workspaceId/tasks/:taskId')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER)
  @ApiOperation({ summary: 'Get task details and history' })
  get(@Param('workspaceId') workspaceId: string, @Param('taskId') taskId: string) {
    return this.tasks.get(workspaceId, taskId);
  }

  @Patch('workspaces/:workspaceId/tasks/:taskId')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @ApiOperation({ summary: 'Update task details' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(workspaceId, taskId, user.id, dto);
  }

  @Patch('workspaces/:workspaceId/tasks/:taskId/move')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @ApiOperation({ summary: 'Move a task to another column' })
  move(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: MoveTaskDto,
  ) {
    return this.tasks.move(workspaceId, taskId, user.id, dto);
  }

  @Delete('workspaces/:workspaceId/tasks/:taskId')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @ApiOperation({ summary: 'Delete a task' })
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasks.remove(workspaceId, taskId, user.id);
  }

  @Post('workspaces/:workspaceId/tasks/:taskId/comments')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @ApiOperation({ summary: 'Add a task comment' })
  comment(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCommentDto,
  ) {
    return this.tasks.comment(workspaceId, taskId, user.id, dto);
  }
}
