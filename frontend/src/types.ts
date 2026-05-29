export interface Deployment {
  id: string;
  clientName: string;
  domain: string;
  image: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface LogLine {
  ts: string;
  message: string;
  level?: string;
}

export interface DeploymentDetail extends Deployment {
  containerName?: string;
  containerId?: string;
  hostPort?: string;
  lambdaRequestId?: string;
  teardownLambdaRequestId?: string;
  errorMessage?: string;
  logs?: LogLine[];
}
