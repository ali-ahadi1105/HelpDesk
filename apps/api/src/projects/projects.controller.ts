import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { AuthUser } from '../common/types/authenticated-request';
import { CreateColumnDto } from './dto/create-column.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER)
  @ApiOperation({ summary: 'List workspace projects' })
  list(@Param('workspaceId') workspaceId: string) {
    return this.projects.list(workspaceId);
  }

  @Post()
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @ApiOperation({ summary: 'Create a project with default columns' })
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projects.create(workspaceId, user.id, dto);
  }

  @Get(':projectId')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER)
  @ApiOperation({ summary: 'Get a project board' })
  get(@Param('workspaceId') workspaceId: string, @Param('projectId') projectId: string) {
    return this.projects.get(workspaceId, projectId);
  }

  @Patch(':projectId')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @ApiOperation({ summary: 'Update project details' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(workspaceId, projectId, user.id, dto);
  }

  @Post(':projectId/columns')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @ApiOperation({ summary: 'Add a board column' })
  addColumn(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateColumnDto,
  ) {
    return this.projects.addColumn(workspaceId, projectId, user.id, dto);
  }

  @Patch(':projectId/columns/:columnId')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @ApiOperation({ summary: 'Rename or recolor a board column' })
  updateColumn(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('columnId') columnId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateColumnDto,
  ) {
    return this.projects.updateColumn(workspaceId, projectId, columnId, user.id, dto);
  }

  @Delete(':projectId/columns/:columnId')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @ApiOperation({ summary: 'Remove an empty board column' })
  removeColumn(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('columnId') columnId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projects.removeColumn(workspaceId, projectId, columnId, user.id);
  }

  @Delete(':projectId')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Delete a project and its board' })
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projects.remove(workspaceId, projectId, user.id);
  }
}
