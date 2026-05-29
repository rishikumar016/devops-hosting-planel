export interface Deployment {
  id: string;
  clientName: string;
  domain: string;
  image: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface LogEntry {
  ts: string;
  message: string;
  level?: string;
}

export interface DeploymentDetailData extends Deployment {
  containerName?: string;
  containerId?: string;
  hostPort?: number;
  lambdaRequestId?: string;
  teardownLambdaRequestId?: string;
  errorMessage?: string;
  logs?: LogEntry[];
}
