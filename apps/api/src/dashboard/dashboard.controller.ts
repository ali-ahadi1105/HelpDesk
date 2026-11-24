import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @WorkspaceRoles(Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER)
  @ApiOperation({ summary: 'Get workspace metrics and activity' })
  get(@Param('workspaceId') workspaceId: string) {
    return this.dashboard.get(workspaceId);
  }
}
