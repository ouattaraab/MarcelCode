import { Request, Response, NextFunction } from 'express';
import { logger } from '../config';
import { ApiError } from '@marcelia/shared';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.headers['x-request-id'] as string;

  logger.error({ err, requestId }, 'Unhandled error');

  const apiError: ApiError = {
    error: err.message || 'Internal server error',
    code: 'INTERNAL_ERROR',
    statusCode: 500,
    requestId,
  };

  res.status(500).json(apiError);
}
