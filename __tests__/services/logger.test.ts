import type { LogContext } from '../../services/logger';

const mockPinoInstance = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
jest.mock('pino', () => () => mockPinoInstance);

// Import after mocks are registered
let loggerModule: typeof import('../../services/logger');

beforeAll(async () => {
  loggerModule = await import('../../services/logger');
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('logger.info', () => {
  it('calls pino.info with message and context', () => {
    const ctx: LogContext = { route: '/api/test', userId: 'u1' };
    loggerModule.logger.info('test message', ctx);
    expect(mockPinoInstance.info).toHaveBeenCalledWith(ctx, 'test message');
  });

  it('works without context', () => {
    loggerModule.logger.info('no context');
    expect(mockPinoInstance.info).toHaveBeenCalledWith({}, 'no context');
  });
});

describe('logger.warn', () => {
  it('calls pino.warn with message and context', () => {
    const ctx: LogContext = { route: '/api/test', action: 'rate-limited' };
    loggerModule.logger.warn('warn message', ctx);
    expect(mockPinoInstance.warn).toHaveBeenCalledWith(ctx, 'warn message');
  });
});

describe('logger.error', () => {
  it('calls pino.error with message, context, and error details', () => {
    const ctx: LogContext = { route: '/api/logs' };
    const err = new Error('db timeout');
    loggerModule.logger.error('insert failed', ctx, err);
    expect(mockPinoInstance.error).toHaveBeenCalledWith(
      expect.objectContaining({
        route: '/api/logs',
        err: expect.objectContaining({ message: 'db timeout' }),
      }),
      'insert failed',
    );
  });

  it('works without an error object', () => {
    loggerModule.logger.error('something failed', { route: '/api/logs' });
    expect(mockPinoInstance.error).toHaveBeenCalledWith(
      expect.objectContaining({ route: '/api/logs' }),
      'something failed',
    );
  });
});

describe('LogContext type', () => {
  it('accepts known optional fields without TypeScript errors', () => {
    const ctx: LogContext = {
      route: '/api/invoices',
      action: 'upload',
      status: 201,
      durationMs: 42,
    };
    loggerModule.logger.info('typed context', ctx);
    expect(mockPinoInstance.info).toHaveBeenCalledWith(ctx, 'typed context');
  });
});
