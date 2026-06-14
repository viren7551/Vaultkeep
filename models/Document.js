const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  originalName: {
    type: String,
    required: true
  },
  filePath: {
    type: String,
    required: false
  },
  fileData: {
    type: Buffer,
    required: true
  },
  fileType: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  side: {
    type: String,
    enum: ['front', 'back', 'single'],
    default: 'single'
  }
});

const documentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  holderName: {
    type: String,
    required: [true, 'Holder name is required'],
    trim: true
  },
  documentName: {
    type: String,
    required: [true, 'Document name/title is required'],
    trim: true
  },
  files: [fileSchema],
  uploadDate: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Document', documentSchema);
