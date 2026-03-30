export type MppSessionRecord = {
  sessionId: string
  serviceName: string
  serviceVersion: string
  createdAt: string
}

export class ParlyMppAdapter {
  constructor(
    private readonly serviceName: string,
    private readonly serviceVersion: string
  ) {}

  createSession(sessionId: string): MppSessionRecord {
    return {
      sessionId,
      serviceName: this.serviceName,
      serviceVersion: this.serviceVersion,
      createdAt: new Date().toISOString()
    }
  }

  describe(): string {
    return `${this.serviceName}@${this.serviceVersion}`
  }
}
