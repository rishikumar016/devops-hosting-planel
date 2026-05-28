const express = require('express');
const Deployment = require('../models/Deployment');
const { validateDeployInput } = require('../utils/validate');
const { enqueueDeploy, enqueueRollback } = require('../queue');

const router = express.Router();

router.post('/deploy', async (req, res, next) => {
  try {
    const { ok, errors, data } = validateDeployInput(req.body);
    if (!ok) return res.status(400).json({ ok: false, errors });

    const deployment = await Deployment.create({
      ...data,
      status: 'Pending',
      logs: [{ level: 'info', message: 'Request received, queued for deployment.' }],
    });

    await enqueueDeploy(deployment.id);

    return res.status(200).json({
      ok: true,
      deployment: {
        id: deployment.id,
        clientName: deployment.clientName,
        domain: deployment.domain,
        image: deployment.image,
        status: deployment.status,
        createdAt: deployment.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/deploy/:id/rollback', async (req, res, next) => {
  try {
    const deployment = await Deployment.findById(req.params.id);
    if (!deployment) return res.status(404).json({ ok: false, error: 'Deployment not found' });
    if (!['Completed', 'Failed'].includes(deployment.status)) {
      return res.status(409).json({
        ok: false,
        error: `Cannot roll back from status "${deployment.status}". Only Completed/Failed are rollback-eligible.`,
      });
    }

    deployment.status = 'Rolling Back';
    deployment.logs.push({ level: 'warn', message: 'Rollback requested by admin.' });
    await deployment.save();

    await enqueueRollback(deployment.id);

    return res.status(202).json({ ok: true, id: deployment.id, status: deployment.status });
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ ok: false, error: 'Invalid id' });
    next(err);
  }
});

router.get('/status/:id', async (req, res, next) => {
  try {
    const deployment = await Deployment.findById(req.params.id);
    if (!deployment) return res.status(404).json({ ok: false, error: 'Deployment not found' });
    return res.json(deployment.toJSON());
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ ok: false, error: 'Invalid id' });
    next(err);
  }
});

router.get('/deployments', async (_req, res, next) => {
  try {
    const rows = await Deployment.find(
      {},
      'clientName domain image status createdAt updatedAt'
    )
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const projected = rows.map((r) => ({
      id: r._id.toString(),
      clientName: r.clientName,
      domain: r.domain,
      image: r.image,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return res.json({ ok: true, deployments: projected });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
