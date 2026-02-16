import { ModelId, AuthenticatedUser, UserRole } from '@marcelia/shared';
import { logger } from '../config';

type RequestType = 'chat' | 'completion' | 'review';

const MODEL_ROUTING: Record<RequestType, ModelId> = {
  completion: ModelId.HAIKU,
  chat: ModelId.SONNET,
  review: ModelId.SONNET,
};

export function routeRequest(
  requestType: RequestType,
  requestedModel: ModelId | undefined,
  user: AuthenticatedUser,
): ModelId {
  // Admin/team_lead can use any model
  if (requestedModel && (user.role === UserRole.ADMIN || user.role === UserRole.TEAM_LEAD)) {
    logger.debug({ userId: user.id, model: requestedModel }, 'Using requested model (privileged)');
    return requestedModel;
  }

  // Developers can request up to Sonnet
  if (requestedModel && user.role === UserRole.DEVELOPER) {
    if (requestedModel === ModelId.OPUS) {
      logger.info({ userId: user.id }, 'Developer downgraded from Opus to Sonnet');
      return ModelId.SONNET;
    }
    return requestedModel;
  }

  // Default routing by request type
  const model = MODEL_ROUTING[requestType];
  logger.debug({ requestType, model }, 'Auto-routed model');
  return model;
}
