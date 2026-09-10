import {
  withOutboundTimeout,
  OutboundTimeoutError,
} from '../../services/outboundTimeout';

describe('withOutboundTimeout', () => {
  it('resolves with the wrapped value when it settles before the timeout', async () => {
    await expect(
      withOutboundTimeout(Promise.resolve('ok'), 'test-op', 50),
    ).resolves.toBe('ok');
  });

  it('propagates the original rejection when it rejects before the timeout', async () => {
    await expect(
      withOutboundTimeout(Promise.reject(new Error('boom')), 'test-op', 50),
    ).rejects.toThrow('boom');
  });

  it('rejects with OutboundTimeoutError when the promise never settles', async () => {
    const neverSettles = new Promise(() => {});
    await expect(
      withOutboundTimeout(neverSettles, 'test-op', 20),
    ).rejects.toBeInstanceOf(OutboundTimeoutError);
  });

  it('names the operation and the budget in the timeout error message', async () => {
    const neverSettles = new Promise(() => {});
    await expect(
      withOutboundTimeout(neverSettles, 'sendEmailAlert:sendMail', 20),
    ).rejects.toThrow(/sendEmailAlert:sendMail.*20ms/);
  });
});
