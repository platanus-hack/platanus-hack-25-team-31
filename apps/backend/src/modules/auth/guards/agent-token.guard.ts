import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class AgentTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const expectedToken = process.env.AGENT_API_TOKEN;

    if (!expectedToken) {
      throw new UnauthorizedException(
        'Agent API token not configured on server',
      );
    }

    // Try to get token from X-API-Token header first
    let token = request.headers['x-api-token'];

    // If not found, try Authorization header with Bearer format
    if (!token) {
      const authHeader = request.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      throw new UnauthorizedException('Agent API token is required');
    }

    // Compare tokens securely
    if (token !== expectedToken) {
      throw new UnauthorizedException('Invalid agent API token');
    }

    return true;
  }
}

