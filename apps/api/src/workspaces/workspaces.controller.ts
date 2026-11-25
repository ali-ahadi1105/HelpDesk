import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { AuthUser } from '../common/types/authenticated-request';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspacesService } from './workspaces.service';

@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  @ApiOperation({ summary: 'List workspaces available to the current user' })
  list(@CurrentUser() user: AuthUser) {
    return this.workspaces.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a workspace' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(user.id, dto);
  }

  @Get(':workspaceId')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER)
  @ApiOperation({ summary: 'Get workspace details and members' })
  get(@Param('workspaceId') workspaceId: string) {
    return this.workspaces.get(workspaceId);
  }

  @Patch(':workspaceId')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Update workspace name, description, or slug' })
  update(@Param('workspaceId') workspaceId: string, @Body() dto: UpdateWorkspaceDto) {
    return this.workspaces.update(workspaceId, dto);
  }

  @Get(':workspaceId/invitations')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'List pending invitations for a workspace' })
  listInvitations(@Param('workspaceId') workspaceId: string) {
    return this.workspaces.listInvitations(workspaceId);
  }

  @Delete(':workspaceId/invitations/:invitationId')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Cancel a pending invitation' })
  cancelInvitation(
    @Param('workspaceId') workspaceId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.workspaces.cancelInvitation(workspaceId, invitationId);
  }

  @Post(':workspaceId/invitations')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Invite a member to a workspace' })
  invite(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: InviteMemberDto,
  ) {
    return this.workspaces.invite(workspaceId, user.id, dto);
  }

  @Post('invitations/accept')
  @ApiOperation({ summary: 'Accept a workspace invitation' })
  acceptInvitation(@CurrentUser() user: AuthUser, @Body() dto: AcceptInvitationDto) {
    return this.workspaces.acceptInvitation(dto.token, user.id, user.email);
  }

  @Patch(':workspaceId/members/:memberId')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Update a workspace member role' })
  updateRole(
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.workspaces.updateMemberRole(workspaceId, memberId, dto.role);
  }

  @Delete(':workspaceId/members/:memberId')
  @WorkspaceRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Remove a workspace member' })
  removeMember(
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workspaces.removeMember(workspaceId, memberId, user.id);
  }
}
