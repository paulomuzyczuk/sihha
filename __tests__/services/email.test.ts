import nodemailer from 'nodemailer';
import { sendEmailAlert } from '../../services/email';

jest.mock('nodemailer');

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
