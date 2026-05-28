const { mongoose } = require('../config/db');

const LogSchema = new mongoose.Schema(
  {
    ts: { type: Date, default: Date.now },
    level: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
    message: { type: String, required: true },
  },
  { _id: false }
);

const DeploymentSchema = new mongoose.Schema(
  {
    clientName: { type: String, required: true, trim: true },
    domain: { type: String, required: true, trim: true, lowercase: true },
    image: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['Pending', 'In Progress', 'Completed', 'Failed', 'Rolling Back', 'Rolled Back'],
      default: 'Pending',
      index: true,
    },
    logs: { type: [LogSchema], default: [] },
    containerId: { type: String },
    containerName: { type: String },
    hostPort: { type: Number },
    lambdaRequestId: { type: String },
    teardownLambdaRequestId: { type: String },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

DeploymentSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Deployment', DeploymentSchema);
