const crypto = require('crypto');
const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = require('@aws-sdk/client-ssm');
const { NodeSSH } = require('node-ssh');

function shellEscape(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'client';
}

function containerNameFor(clientName, domain) {
  return `client-${slugify(`${clientName}-${domain}`)}`.slice(0, 60);
}

function portForDomain(domain) {
  const h = crypto.createHash('sha1').update(String(domain)).digest();
  const n = h.readUInt32BE(0);
  return 10000 + (n % 5000);
}

function buildDockerScript({ image, domain, containerName, port }) {
  const img = shellEscape(image);
  const name = shellEscape(containerName);
  const dom = shellEscape(domain);
  const label = `platform.domain=${domain.replace(/[^a-z0-9.\-]/g, '')}`;
  const safeLabel = shellEscape(label);
  return [
    `docker pull ${img}`,
    `( docker rm -f ${name} 2>/dev/null || true )`,
    `docker run -d --name ${name} --label ${safeLabel} --restart unless-stopped -p ${port}:80 ${img}`,
    `echo DOMAIN=${dom}`,
  ].join(' && ');
}

async function runViaSSM(script, opts = {}) {
  const region = process.env.AWS_REGION;
  const instanceId = process.env.EC2_INSTANCE_ID;
  if (!region) throw new Error('AWS_REGION not set');
  if (!instanceId) throw new Error('EC2_INSTANCE_ID not set');

  const client = new SSMClient({ region });
  const send = await client.send(
    new SendCommandCommand({
      DocumentName: 'AWS-RunShellScript',
      InstanceIds: [instanceId],
      Parameters: { commands: [script] },
      TimeoutSeconds: 600,
      Comment: opts.comment || 'hosting-control-panel',
    })
  );
  const commandId = send.Command?.CommandId;
  if (!commandId) throw new Error('SSM did not return a CommandId');

  const deadline = Date.now() + 90_000;
  let last;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      last = await client.send(
        new GetCommandInvocationCommand({ CommandId: commandId, InstanceId: instanceId })
      );
    } catch (err) {
      if (err.name === 'InvocationDoesNotExist') continue;
      throw err;
    }
    const status = last.Status;
    if (['Success', 'Failed', 'Cancelled', 'TimedOut'].includes(status)) {
      if (status !== 'Success') {
        const e = new Error(`SSM command ${status}: ${last.StandardErrorContent || last.StandardOutputContent || ''}`);
        e.ssmStatus = status;
        throw e;
      }
      return { stdout: last.StandardOutputContent || '', stderr: last.StandardErrorContent || '' };
    }
  }
  throw new Error('SSM command timed out after 90s');
}

async function runViaSSH(script) {
  const host = process.env.EC2_HOST;
  const username = process.env.EC2_USERNAME || 'ubuntu';
  const privateKeyPath = process.env.EC2_SSH_PRIVATE_KEY_PATH;
  if (!host) throw new Error('EC2_HOST not set');
  if (!privateKeyPath) throw new Error('EC2_SSH_PRIVATE_KEY_PATH not set');

  const ssh = new NodeSSH();
  await ssh.connect({ host, username, privateKeyPath });
  try {
    const result = await ssh.execCommand(script);
    if (result.code !== 0 && result.code !== null) {
      const e = new Error(`SSH exec exited with code ${result.code}: ${result.stderr || result.stdout}`);
      e.sshCode = result.code;
      throw e;
    }
    return { stdout: result.stdout || '', stderr: result.stderr || '' };
  } finally {
    ssh.dispose();
  }
}

function parseContainerIdFromOutput(stdout) {
  const lines = String(stdout).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (/^[a-f0-9]{12,64}$/i.test(line)) return line;
  }
  return null;
}

async function runDockerOnEC2({ image, domain, clientName }) {
  const containerName = containerNameFor(clientName, domain);
  const port = portForDomain(domain);
  const script = buildDockerScript({ image, domain, containerName, port });

  const mode = (process.env.EC2_EXEC_MODE || 'ssm').toLowerCase();
  const exec = mode === 'ssh' ? runViaSSH : runViaSSM;
  const { stdout, stderr } = await exec(script, { comment: `deploy-${containerName}` });

  const containerId = parseContainerIdFromOutput(stdout);
  return { containerId, containerName, port, rawOutput: stdout, rawError: stderr };
}

async function stopDockerOnEC2({ containerName }) {
  if (!containerName) throw new Error('containerName is required');
  const name = shellEscape(containerName);
  const script = `docker rm -f ${name} 2>/dev/null || true`;

  const mode = (process.env.EC2_EXEC_MODE || 'ssm').toLowerCase();
  const exec = mode === 'ssh' ? runViaSSH : runViaSSM;
  const { stdout, stderr } = await exec(script, { comment: `stop-${containerName}` });
  return { stdout, stderr };
}

module.exports = {
  runDockerOnEC2,
  stopDockerOnEC2,
  containerNameFor,
  portForDomain,
  shellEscape,
};
