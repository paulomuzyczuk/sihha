import nodemailer from 'nodemailer';
import { DEFAULT_LOCALE } from '../../lib/i18n/dictionaries';
import { emailLocale, emailText, sendEmailAlert } from '../../services/email';

jest.mock('nodemailer');

describe('emailLocale / emailText', () => {
  const originalLocale = process.env.EMAIL_LOCALE;

  afterEach(() => {
    if (originalLocale === undefined) {
      delete process.env.EMAIL_LOCALE;
    } else {
      process.env.EMAIL_LOCALE = originalLocale;
    }
  });

  it('defaults to DEFAULT_LOCALE when EMAIL_LOCALE is unset or invalid', () => {
    delete process.env.EMAIL_LOCALE;
    expect(emailLocale()).toBe(DEFAULT_LOCALE);
    process.env.EMAIL_LOCALE = 'fr';
    expect(emailLocale()).toBe(DEFAULT_LOCALE);
  });

  it('renders alert e-mails in the configured locale', () => {
    process.env.EMAIL_LOCALE = 'pt';
    expect(emailText('email.lowStockSubject', { name: 'Olanzapine' })).toBe(
      '[sihha] Estoque baixo: Olanzapine',
    );

    process.env.EMAIL_LOCALE = 'en';
    expect(emailText('email.lowStockSubject', { name: 'Olanzapine' })).toBe(
      '[sihha] Low stock: Olanzapine',
    );
    expect(
      emailText('email.missingLogBody', { date: '2026-07-07', name: 'Rex' }),
    ).toBe('Date: 2026-07-07\nCare recipient: Rex');
  });
});

describe('sendEmailAlert', () => {
  const mockSendMail = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail,
    });
  });

  it('should send email and return true on success', async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: 'msg-id-123' });

    const result = await sendEmailAlert(
      'admin@example.com',
      'Test subject',
      'Test body',
    );

    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@example.com',
        subject: 'Test subject',
        text: 'Test body',
      }),
    );
  });

  it('should return false if sendMail throws', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

    const result = await sendEmailAlert(
      'admin@example.com',
      'Test subject',
      'Test body',
    );

    expect(result).toBe(false);
  });

  it('sets cc to ADMIN_EMAIL when recipient differs', async () => {
    mockSendMail.mockResolvedValueOnce({});
    process.env.ADMIN_EMAIL = 'admin@example.com';

    await sendEmailAlert('therapist@example.com', 'subject', 'body');

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ cc: 'admin@example.com' }),
    );
  });

  it('omits cc when recipient equals ADMIN_EMAIL', async () => {
    mockSendMail.mockResolvedValueOnce({});
    process.env.ADMIN_EMAIL = 'admin@example.com';

    await sendEmailAlert('admin@example.com', 'subject', 'body');

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ cc: undefined }),
    );
  });

  it('should throw if to, subject, or body is empty', async () => {
    await expect(sendEmailAlert('', 'subject', 'body')).rejects.toThrow(
      'sendEmailAlert: expected non-empty to address, got ""',
    );
    await expect(sendEmailAlert('to@example.com', '', 'body')).rejects.toThrow(
      'sendEmailAlert: expected non-empty subject, got ""',
    );
    await expect(
      sendEmailAlert('to@example.com', 'subject', ''),
    ).rejects.toThrow('sendEmailAlert: expected non-empty body, got ""');
  });
});
