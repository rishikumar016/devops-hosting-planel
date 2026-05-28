const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

function decodePayload(payloadBytes) {
  if (!payloadBytes) return null;
  const text = Buffer.from(payloadBytes).toString('utf8');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function invokeLambda(functionName, payload) {
  if (!functionName) throw new Error('Lambda function name not provided');
  const region = process.env.AWS_REGION;
  if (!region) throw new Error('AWS_REGION not set');

  const client = new LambdaClient({ region });
  const res = await client.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(payload || {})),
    })
  );

  const parsedBody = decodePayload(res.Payload);
  if (res.FunctionError) {
    const detail = typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody);
    const err = new Error(`Lambda ${functionName} returned FunctionError=${res.FunctionError}: ${detail}`);
    err.functionError = res.FunctionError;
    err.payload = parsedBody;
    throw err;
  }
  return { requestId: res.$metadata?.requestId, payload: parsedBody };
}

function invokePostDeployLambda(payload) {
  return invokeLambda(process.env.LAMBDA_FUNCTION_NAME, payload);
}

function invokeTeardownLambda(payload) {
  return invokeLambda(process.env.LAMBDA_TEARDOWN_FUNCTION_NAME, payload);
}

module.exports = { invokeLambda, invokePostDeployLambda, invokeTeardownLambda };
