import { UseGuards } from '@nestjs/common';
import { AgentTokenGuard } from '../guards/agent-token.guard';

/**
 * Decorator to protect endpoints with agent token authentication
 * Use this decorator on controllers or individual methods to require
 * the agent API token in the request headers
 */
export const AgentToken = () => UseGuards(AgentTokenGuard);

