const mockPinoInstance = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
jest.mock('pino', () => () => mockPinoInstance);

const mockSendEmailAlert = jest.fn();
jest.mock('../../services/email', () => ({
  sendEmailAlert: (...args: unknown[]) => mockSendEmailAlert(...args),
}));

// Import after mocks are registered
let alertingModule: typeof import('../../services/alerting');

beforeAll(async () => {
  alertingModule = await import('../../services/alerting');
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('criticalAlert', () => {
  it('sends an email alert for critical events', async () => {
    process.env.ALERT_EMAIL_ADMIN = 'admin@example.com';
    mockSendEmailAlert.mockResolvedValueOnce(true);

    await alertingModule.criticalAlert('critical failure', {
      route: '/api/cron',
    });

    expect(mockSendEmailAlert).toHaveBeenCalledWith(
      'admin@example.com',
      expect.stringContaining('[sihha]'),
      expect.stringContaining('critical failure'),
    );
  });

  it('logs at error level via pino for critical events', async () => {
    mockSendEmailAlert.mockResolvedValueOnce(true);
    await alertingModule.criticalAlert('disk full', { route: '/api/cron' });
    expect(mockPinoInstance.error).toHaveBeenCalledWith(
      expect.objectContaining({ critical: true }),
      'disk full',
    );
  });

  it('does not throw when ALERT_EMAIL_ADMIN is unset', async () => {
    delete process.env.ALERT_EMAIL_ADMIN;
    await expect(
      alertingModule.criticalAlert('no email configured', {
        route: '/api/cron',
      }),
    ).resolves.not.toThrow();
  });

  it('does not throw when sendEmailAlert rejects', async () => {
    process.env.ALERT_EMAIL_ADMIN = 'admin@example.com';
    mockSendEmailAlert.mockRejectedValueOnce(new Error('smtp down'));
    await expect(
      alertingModule.criticalAlert('smtp error path', { route: '/api/cron' }),
    ).resolves.not.toThrow();
  });

  it('does not include PII fields in email body', async () => {
    process.env.ALERT_EMAIL_ADMIN = 'admin@example.com';
    mockSendEmailAlert.mockResolvedValueOnce(true);

    await alertingModule.criticalAlert('pii test', {
      route: '/api/logs',
      userId: 'user-uuid-123',
    });

    const [, , emailBody] = mockSendEmailAlert.mock.calls[0];
    expect(emailBody).not.toContain('user-uuid-123');
  });
});
