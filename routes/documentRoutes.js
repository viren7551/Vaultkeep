const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Document = require('../models/Document');
const auth = require('../middleware/auth');

// Multer Storage Configuration (Files stored in memory buffer, then saved to MongoDB)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // Limit file size to 50MB
  fileFilter: (req, file, cb) => {
    cb(null, true);
  }
});

// Configure Multer for up to 2 files: frontFile (required) and backFile (optional)
const docUploadFields = upload.fields([
  { name: 'frontFile', maxCount: 1 },
  { name: 'backFile', maxCount: 1 }
]);

// @route   POST /api/documents/upload
// @desc    Upload a new document (with optional front/back side support)
router.post('/upload', auth, docUploadFields, async (req, res) => {
  try {
    const { holderName, documentName } = req.body;
    
    if (!holderName || !documentName) {
      return res.status(400).json({ error: 'Holder name and Document name are required' });
    }
    
    // Check if frontFile is present
    if (!req.files || !req.files['frontFile'] || !req.files['frontFile'][0]) {
      return res.status(400).json({ error: 'Front side document file is required' });
    }

    const frontFile = req.files['frontFile'][0];
    const hasBackSide = req.files['backFile'] && req.files['backFile'][0];

    const filesArray = [{
      originalName: frontFile.originalname,
      fileData: frontFile.buffer,
      fileType: frontFile.mimetype,
      fileSize: frontFile.size,
      side: hasBackSide ? 'front' : 'single'
    }];

    if (hasBackSide) {
      const backFile = req.files['backFile'][0];
      filesArray.push({
        originalName: backFile.originalname,
        fileData: backFile.buffer,
        fileType: backFile.mimetype,
        fileSize: backFile.size,
        side: 'back'
      });
    }

    const newDocument = new Document({
      user: req.user,
      holderName: holderName.trim(),
      documentName: documentName.trim(),
      files: filesArray
    });

    const savedDoc = await newDocument.save();
    res.status(201).json(savedDoc);
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ error: 'Server error during document upload' });
  }
});

// @route   GET /api/documents
// @desc    Get all documents for logged-in user
router.get('/', auth, async (req, res) => {
  try {
    const { search } = req.query;
    let query = { user: req.user };
    
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query = {
        user: req.user,
        $or: [
          { holderName: searchRegex },
          { documentName: searchRegex },
          { 'files.originalName': searchRegex }
        ]
      };
    }

    const documents = await Document.find(query).sort({ uploadDate: -1 });
    res.json(documents);
  } catch (error) {
    console.error('Fetch Error:', error);
    res.status(500).json({ error: 'Server error retrieving documents' });
  }
});

// @route   GET /api/documents/download/:id
// @desc    Download a specific document (optionally specify side: front or back)
router.get('/download/:id', auth, async (req, res) => {
  try {
    const document = await Document.findOne({ _id: req.params.id, user: req.user });
    if (!document) {
      return res.status(404).json({ error: 'Document not found or unauthorized' });
    }

    const side = req.query.side || 'front';
    let fileToDownload = null;

    if (document.files && document.files.length > 0) {
      if (document.files.length === 1) {
        fileToDownload = document.files[0];
      } else {
        fileToDownload = document.files.find(f => f.side === side);
        if (!fileToDownload) {
          // Fallback to first file
          fileToDownload = document.files[0];
        }
      }
    }

    if (!fileToDownload) {
      return res.status(404).json({ error: 'File not found in document records' });
    }

    // First try downloading from database buffer
    if (fileToDownload.fileData) {
      res.setHeader('Content-Type', fileToDownload.fileType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileToDownload.originalName)}"`);
      return res.send(fileToDownload.fileData);
    }

    // Backward compatibility: If it's stored on disk
    if (fileToDownload.filePath) {
      if (!fs.existsSync(fileToDownload.filePath)) {
        return res.status(404).json({ error: 'File does not exist on server filesystem' });
      }
      return res.download(fileToDownload.filePath, fileToDownload.originalName);
    }

    return res.status(404).json({ error: 'No file data available for download' });
  } catch (error) {
    console.error('Download Error:', error);
    res.status(500).json({ error: 'Server error downloading document' });
  }
});

// @route   DELETE /api/documents/:id
// @desc    Delete a specific document
router.delete('/:id', auth, async (req, res) => {
  try {
    const document = await Document.findOne({ _id: req.params.id, user: req.user });
    if (!document) {
      return res.status(404).json({ error: 'Document not found or unauthorized' });
    }

    // Delete all associated files from local uploads storage
    if (document.files && document.files.length > 0) {
      for (const file of document.files) {
        if (fs.existsSync(file.filePath)) {
          try {
            fs.unlinkSync(file.filePath);
          } catch (err) {
            console.error('Error removing file from disk:', err);
          }
        }
      }
    }

    // Remove metadata record from DB
    await Document.findByIdAndDelete(req.params.id);

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete Error:', error);
    res.status(500).json({ error: 'Server error deleting document' });
  }
});

module.exports = router;
