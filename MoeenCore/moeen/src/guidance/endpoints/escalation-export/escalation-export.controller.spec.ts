import { EscalationExportController } from './escalation-export.controller';

describe('EscalationExportController', () => {
  it('passes the authenticated user id to the service', async () => {
    const service = {
      getExport: jest.fn().mockResolvedValue({ medications: [], recentDoses: [] }),
    };
    const controller = new EscalationExportController(service as never);

    await controller.getExport({ id: 42 });

    expect(service.getExport).toHaveBeenCalledWith(42);
  });
});
